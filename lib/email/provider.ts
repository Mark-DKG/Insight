import { fromHeader, type EmailConfig } from "./config";

// Resend REST client over fetch (no SDK). Server-side only; the API key is read
// from the environment at call time and never returned or logged.

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export interface ProviderResult {
  ok: boolean;
  id?: string;
  /** HTTP status from the provider, when there was a response. */
  status?: number;
  /** Safe, short error text (never contains the API key or message body). */
  error?: string;
  /** True when trying again later may succeed (network, 429, 5xx). */
  retryable: boolean;
  retryAfterMs?: number;
}

export type Provider = (msg: OutgoingEmail, cfg: EmailConfig) => Promise<ProviderResult>;

export const resendProvider: Provider = async (msg, cfg) => {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not configured.", retryable: false };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: fromHeader(cfg),
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: msg.replyTo ?? cfg.replyTo,
        ...(msg.headers ? { headers: msg.headers } : {}),
      }),
    }).finally(() => clearTimeout(timer));
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data?.id) return { ok: true, id: String(data.id), status: res.status, retryable: false };
    const retryAfter = Number(res.headers.get("retry-after"));
    const retryable = res.status === 429 || res.status >= 500;
    const message = typeof data?.message === "string" ? data.message : `Provider returned HTTP ${res.status}.`;
    return {
      ok: false,
      status: res.status,
      error: message.slice(0, 300),
      retryable,
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 3_600_000) : undefined,
    };
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "Provider request timed out." : "Could not reach the email provider.", retryable: true };
  }
};
