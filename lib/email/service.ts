import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emailConfig, isEmailAddress, maskAddress, stripCrlf, type EmailConfig } from "./config";
import { resendProvider, type Provider, type ProviderResult } from "./provider";
import { render } from "./templates";

// ----------------------------------------------------------------------------
// Central email service. Everything that sends mail goes through here:
//  - server-side only, Resend over fetch
//  - EMAIL_ENABLED (env) AND the Super Admin switch (DB) must both allow sending;
//    when off, the row is recorded as SKIPPED and the caller carries on
//  - every email is a row in EmailMessage (the outbox and the delivery record);
//    idempotencyKey prevents duplicates
//  - one-time links (verification, reset) are rendered at send time and never
//    stored; if they fail the user simply asks for a new one
//  - failures never throw into request handlers
// ----------------------------------------------------------------------------

export type EmailCategory = "auth" | "security" | "business" | "marketplace" | "admin" | "contact" | "test";

export const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const INLINE_BUDGET_MS = 5000;

/** Keep a promise alive after the response is sent (Vercel waitUntil), or just let it run elsewhere. */
function background(p: Promise<unknown>) {
  try {
    const ctx = (globalThis as any)[Symbol.for("@vercel/request-context")]?.get?.();
    if (ctx?.waitUntil) ctx.waitUntil(p);
  } catch {
    /* nothing to register with */
  }
}

export function backoffMs(attempt: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(attempt, 1), BACKOFF_MINUTES.length) - 1] * 60_000;
}

let provider: Provider = resendProvider;
/** Tests only: replace the provider with a mock so no real request is made. */
export function setProviderForTests(p: Provider | null) {
  provider = p ?? resendProvider;
}

export interface EmailState {
  enabled: boolean;
  /** Why sending is off, when it is. */
  reason: "ok" | "env_disabled" | "admin_disabled" | "no_api_key";
  envEnabled: boolean;
  adminEnabled: boolean;
  centralAddress: string;
}

export async function getEmailState(cfg: EmailConfig = emailConfig()): Promise<EmailState> {
  let adminEnabled = true;
  let central = cfg.adminAddress;
  try {
    const s = await prisma.emailSetting.findUnique({ where: { id: "default" } });
    if (s) {
      adminEnabled = s.enabled;
      if (s.centralAddress && isEmailAddress(s.centralAddress)) central = s.centralAddress;
    }
  } catch {
    /* settings table unreachable: fall back to env */
  }
  const reason = !cfg.envEnabled ? "env_disabled" : !cfg.apiKeyConfigured ? "no_api_key" : !adminEnabled ? "admin_disabled" : "ok";
  return { enabled: reason === "ok", reason, envEnabled: cfg.envEnabled, adminEnabled, centralAddress: central };
}

export interface SendRequest {
  category: EmailCategory;
  template: string;
  to: string;
  /** Non-secret template data; stored until the email is finished. */
  data?: Record<string, unknown>;
  /** Secret data (one-time links). Used to render, never stored or logged. */
  secret?: Record<string, unknown>;
  /** Same key = same email, sent once. */
  key: string;
  businessId?: string | null;
  replyTo?: string;
  /** Send in the background instead of holding the request (business, marketplace and admin mail). */
  defer?: boolean;
}

export interface SendOutcome {
  ok: boolean;
  /** "sent" reached the provider; "queued" will be retried; "skipped" email is off; "duplicate" already handled; "failed" gave up. */
  result: "sent" | "queued" | "skipped" | "duplicate" | "failed" | "invalid";
  id?: string;
  error?: string;
}

function hashKey(k: string) {
  return createHash("sha256").update(k).digest("hex").slice(0, 40);
}

function safeError(e: string | undefined): string | null {
  if (!e) return null;
  return e.replace(/re_[A-Za-z0-9_]+/g, "[key]").slice(0, 300);
}

async function attempt(row: { id: string; attempts: number; toAddress: string; template: string; payload: unknown; idempotencyKey: string; category: string }, secret: Record<string, unknown> | undefined, replyTo: string | undefined, cfg: EmailConfig): Promise<SendOutcome> {
  let rendered;
  try {
    rendered = render(row.template, { ...((row.payload as Record<string, unknown>) ?? {}), ...(secret ?? {}) }, cfg);
  } catch {
    await prisma.emailMessage.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "Template could not be rendered.", payload: Prisma.DbNull } });
    return { ok: false, result: "failed", id: row.id, error: "Template could not be rendered." };
  }
  const attempts = row.attempts + 1;
  await prisma.emailMessage.update({ where: { id: row.id }, data: { status: "SENDING", attempts } });
  const res: ProviderResult = await provider({ to: row.toAddress, subject: rendered.subject, html: rendered.html, text: rendered.text, replyTo, idempotencyKey: hashKey(row.idempotencyKey) }, cfg);
  if (res.ok) {
    await prisma.emailMessage.update({ where: { id: row.id }, data: { status: "SENT", providerId: res.id, sentAt: new Date(), lastError: null, payload: Prisma.DbNull } });
    return { ok: true, result: "sent", id: row.id };
  }
  const exhausted = attempts >= MAX_ATTEMPTS;
  const secretMail = !!secret;
  if (res.retryable && !exhausted && !secretMail) {
    await prisma.emailMessage.update({ where: { id: row.id }, data: { status: "QUEUED", lastError: safeError(res.error), nextAttemptAt: new Date(Date.now() + (res.retryAfterMs ?? backoffMs(attempts))) } });
    return { ok: false, result: "queued", id: row.id, error: res.error };
  }
  await prisma.emailMessage.update({ where: { id: row.id }, data: { status: "FAILED", lastError: safeError(res.error), payload: Prisma.DbNull } });
  await alertDeliveryProblem(row.category, "FAILED", cfg);
  return { ok: false, result: "failed", id: row.id, error: res.error };
}

/** Tell the central address about a delivery problem, once per category/status/day. Never loops on admin mail. */
export async function alertDeliveryProblem(category: string, status: string, cfg: EmailConfig = emailConfig()) {
  if (category === "admin" || category === "test") return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    await sendEmail({ category: "admin", template: "admin_delivery_failure", to: (await getEmailState(cfg)).centralAddress, data: { category, status }, key: `deliveryfail:${category}:${status}:${day}` });
  } catch {
    /* best effort */
  }
}

/**
 * Record and send one email. Never throws. Idempotent on `key`.
 * The send is attempted inline for a few seconds so ordinary requests stay fast;
 * anything unfinished is picked up by processOutbox().
 */
export async function sendEmail(req: SendRequest): Promise<SendOutcome> {
  try {
    const cfg = emailConfig();
    const to = stripCrlf(req.to).toLowerCase();
    if (!isEmailAddress(to)) return { ok: false, result: "invalid", error: "Invalid recipient address." };
    const idem = req.key.slice(0, 200);
    const existing = await prisma.emailMessage.findUnique({ where: { idempotencyKey: idem }, select: { id: true } });
    if (existing) return { ok: true, result: "duplicate", id: existing.id };

    const state = await getEmailState(cfg);
    let row;
    try {
      row = await prisma.emailMessage.create({
        data: {
          idempotencyKey: idem,
          category: req.category,
          template: req.template,
          toAddress: to,
          businessId: req.businessId ?? null,
          status: state.enabled ? "QUEUED" : "SKIPPED",
          lastError: state.enabled ? null : `Email is off (${state.reason}).`,
          payload: state.enabled && !req.secret ? ((req.data ?? {}) as Prisma.InputJsonObject) : undefined,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") return { ok: true, result: "duplicate" };
      throw e;
    }
    if (!state.enabled) return { ok: false, result: "skipped", id: row.id, error: `Email is off (${state.reason}).` };

    const run = attempt({ ...row, payload: { ...(req.data ?? {}) } }, req.secret, req.replyTo, cfg);
    if (req.defer && !req.secret) {
      background(run.catch(() => undefined));
      return { ok: true, result: "queued", id: row.id };
    }
    const timed = await Promise.race([run, new Promise<SendOutcome>((r) => setTimeout(() => r({ ok: false, result: "queued", id: row.id }), INLINE_BUDGET_MS))]);
    return timed;
  } catch {
    return { ok: false, result: "failed", error: "Email service error." };
  }
}

/** Send queued emails that are due (retries). Called by the cron route and the admin "process queue" action. */
export async function processOutbox(limit = 20): Promise<{ processed: number; sent: number; requeued: number; failed: number }> {
  const cfg = emailConfig();
  const state = await getEmailState(cfg);
  if (!state.enabled) return { processed: 0, sent: 0, requeued: 0, failed: 0 };
  // Rows stuck in SENDING (function was cut off mid-request) become due again after 10 minutes.
  await prisma.emailMessage.updateMany({ where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "QUEUED" } });
  const due = await prisma.emailMessage.findMany({ where: { status: "QUEUED", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: limit });
  let sent = 0, requeued = 0, failed = 0;
  for (const row of due) {
    if (!row.payload) {
      await prisma.emailMessage.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "Nothing left to send." } });
      failed++;
      continue;
    }
    const out = await attempt(row, undefined, undefined, cfg);
    if (out.result === "sent") sent++;
    else if (out.result === "queued") requeued++;
    else failed++;
  }
  return { processed: due.length, sent, requeued, failed };
}

// ----------------------------------------------------------------------------
// Typed helpers by purpose
// ----------------------------------------------------------------------------

export async function adminAddress(): Promise<string> {
  return (await getEmailState()).centralAddress;
}

/** Notify the central address (Gmail) about an admin-side event. */
export async function sendAdminNotification(template: string, data: Record<string, unknown>, key: string) {
  return sendEmail({ category: "admin", template, to: await adminAddress(), data, key, defer: true });
}

/** Account and security mail. Essential: never gated by preferences. */
export function sendAuthEmail(template: string, to: string, data: Record<string, unknown>, key: string, secret?: Record<string, unknown>, businessId?: string | null) {
  return sendEmail({ category: template.startsWith("security") ? "security" : "auth", template, to, data, secret, key, businessId });
}

/** Business operations mail. Callers must have checked the business preference first. */
export function sendBusinessEmail(template: string, to: string, data: Record<string, unknown>, key: string, businessId: string) {
  return sendEmail({ category: "business", template, to, data, key, businessId, defer: true });
}

/** Insight Store mail (seller applications, marketplace orders). */
export function sendMarketplaceEmail(template: string, to: string, data: Record<string, unknown>, key: string, businessId?: string | null) {
  return sendEmail({ category: "marketplace", template, to, data, key, businessId, defer: true });
}

export { maskAddress };
