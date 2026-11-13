// Email unit tests (mocks only: no real provider, no database, no real addresses).
// npx esbuild tests/unit/email.test.ts --bundle --platform=node --alias:@/lib/prisma=./tests/unit/fake-prisma.ts --alias:@prisma/client=./tests/unit/fake-prisma.ts --outfile=/tmp/e.js && node /tmp/e.js
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { emailConfig, DEFAULT_CONTACT, RESEND_TEST_SENDER, fromHeader, appLink, maskAddress, stripCrlf, isEmailAddress } from "../../lib/email/config";
import { TEMPLATES, render, esc } from "../../lib/email/templates";
import { verifyWebhook, statusForEvent, shouldAdvance } from "../../lib/email/webhook";
import { checkContact } from "../../lib/email/contact";
import { readPrefs, EMAIL_PREF_DEFAULTS } from "../../lib/email/preferences";
import { newToken, hashToken } from "../../lib/email/tokens";
import { sendEmail, processOutbox, setProviderForTests, backoffMs, MAX_ATTEMPTS, sendAdminNotification, getEmailState } from "../../lib/email/service";
import { db, resetDb } from "./fake-prisma";

const ENV = { EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test_not_real" };
function setEnv(e: Record<string, string | undefined>) { for (const k of ["EMAIL_ENABLED", "RESEND_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_ADMIN_ADDRESS", "EMAIL_CONTACT_ADDRESS", "APP_PUBLIC_URL"]) delete process.env[k]; Object.assign(process.env, e); }

// ---- config ---------------------------------------------------------------
test("defaults: email off, test sender, Gmail is the only contact", () => {
  const c = emailConfig({});
  assert.equal(c.envEnabled, false); assert.equal(c.fromAddress, RESEND_TEST_SENDER); assert.equal(c.usingTestSender, true);
  assert.equal(c.contactAddress, DEFAULT_CONTACT); assert.equal(c.replyTo, DEFAULT_CONTACT); assert.equal(c.adminAddress, DEFAULT_CONTACT);
});
test("the Gmail address is never the sender by default", () => { assert.notEqual(emailConfig({}).fromAddress, DEFAULT_CONTACT); });
test("env overrides and APP_PUBLIC_URL trailing slash", () => {
  const c = emailConfig({ EMAIL_ENABLED: "TRUE", EMAIL_FROM_ADDRESS: "hello@example.test", APP_PUBLIC_URL: "https://app.example.test/", EMAIL_FROM_NAME: "Insight\r\nBcc: x@y.z" });
  assert.equal(c.envEnabled, true); assert.equal(c.usingTestSender, false); assert.equal(c.appUrl, "https://app.example.test");
  assert.ok(!/[\r\n]/.test(fromHeader(c)));
  assert.equal(appLink("/login", c), "https://app.example.test/login");
});
test("helpers", () => {
  assert.equal(maskAddress("someone@example.test"), "so***@example.test");
  assert.equal(stripCrlf("a\r\nb"), "a b");
  assert.ok(isEmailAddress("a@b.co")); assert.ok(!isEmailAddress("a@b")); assert.ok(!isEmailAddress("a b@c.de")); assert.ok(!isEmailAddress("a@b.co\nbcc:x@y.zz"));
});

// ---- templates ------------------------------------------------------------
const SAMPLE: Record<string, any> = {
  name: "Ama", businessName: "Shop <b>", url: "https://app.example.test/x?token=abc", status: "APPROVED", reference: "R1", productName: "Rice", quantity: 2, minimum: 5, period: "2026-01-01", count: 3, revenue: "10", supplier: "S", total: "5", items: 1, statusLabel: "confirmed",
  event: "e", detail: "d", category: "auth", when: "now", subject: "s", email: "a@b.co", message: "hello there", inviterName: "Kofi", roleLabel: "Cashier", minutes: 15,
};
test("every template renders HTML and text with the Insight identity and the Gmail contact, no emoji, no 9DEVs", () => {
  const cfg = emailConfig({ APP_PUBLIC_URL: "https://app.example.test" });
  for (const name of Object.keys(TEMPLATES)) {
    const r = render(name, SAMPLE, cfg);
    assert.ok(r.subject.length > 3, name);
    assert.ok(r.html.includes("Insight") && r.html.includes(DEFAULT_CONTACT), name);
    assert.ok(r.text.includes(DEFAULT_CONTACT), name);
    assert.ok(!/9DEVs/i.test(r.html + r.text + r.subject), `${name} mentions 9DEVs`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(r.html + r.text + r.subject), `${name} has an emoji`);
    assert.ok(!/support@|privacy@|noreply@insight\.app/i.test(r.html + r.text), `${name} shows a made-up mailbox`);
    assert.ok(r.html.includes("https://app.example.test/brand/insight-logo-light.png"), name);
  }
});
test("template links use the configured app URL, never a hard-coded host", () => {
  const cfg = emailConfig({ APP_PUBLIC_URL: "https://configured.example.test" });
  const r = render("low_stock", SAMPLE, cfg);
  assert.ok(r.html.includes("https://configured.example.test/inventory"));
  assert.ok(!/vercel\.app|insight\.app/.test(r.html));
});
test("template data is HTML-escaped", () => {
  const r = render("welcome", { name: "<script>x</script>", businessName: "A&B" });
  assert.ok(!r.html.includes("<script>x")); assert.ok(r.html.includes("&lt;script&gt;")); assert.equal(esc(`"'`), "&quot;&#39;");
});
test("order request email makes no payment, acceptance or WhatsApp claims", () => {
  const r = render("seller_new_order", SAMPLE);
  assert.ok(/request, not a confirmed sale/i.test(r.text)); assert.ok(!/whatsapp/i.test(r.text)); assert.ok(!/payment (received|confirmed)/i.test(r.text));
});
test("unknown template throws", () => assert.throws(() => render("nope", {})));

// ---- webhook --------------------------------------------------------------
const SECRET = "whsec_" + Buffer.from("test-secret-key-for-unit-tests").toString("base64");
function sign(body: string, id = "msg_1", ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", Buffer.from(SECRET.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return { id, timestamp: String(ts), signature: `v1,${sig}` };
}
test("webhook: valid signature passes, tampering and wrong secret fail", () => {
  const body = '{"type":"email.delivered"}'; const h = sign(body);
  assert.equal(verifyWebhook(body, h, SECRET), true);
  assert.equal(verifyWebhook(body + " ", h, SECRET), false);
  assert.equal(verifyWebhook(body, h, "whsec_" + Buffer.from("other").toString("base64")), false);
  assert.equal(verifyWebhook(body, { ...h, signature: "v1,AAAA" }, SECRET), false);
  assert.equal(verifyWebhook(body, { id: null, timestamp: h.timestamp, signature: h.signature }, SECRET), false);
  assert.equal(verifyWebhook(body, h, ""), false);
});
test("webhook: stale timestamps are rejected; multiple signatures accepted", () => {
  const body = "{}"; const old = sign(body, "m", Math.floor(Date.now() / 1000) - 3600);
  assert.equal(verifyWebhook(body, old, SECRET), false);
  const h = sign(body); assert.equal(verifyWebhook(body, { ...h, signature: `v1,AAAA ${h.signature}` }, SECRET), true);
});
test("webhook: event mapping and ordering", () => {
  assert.equal(statusForEvent("email.delivered"), "DELIVERED"); assert.equal(statusForEvent("email.bounced"), "BOUNCED"); assert.equal(statusForEvent("email.complained"), "COMPLAINED");
  assert.equal(statusForEvent("email.delivery_delayed"), "DELAYED"); assert.equal(statusForEvent("email.failed"), "FAILED"); assert.equal(statusForEvent("email.sent"), "SENT"); assert.equal(statusForEvent("email.opened"), null);
  assert.equal(shouldAdvance("DELIVERED", "SENT"), false); assert.equal(shouldAdvance("SENT", "DELIVERED"), true); assert.equal(shouldAdvance("DELIVERED", "BOUNCED"), true);
});

// ---- contact form (header injection, spam) ---------------------------------
test("contact: valid input passes", () => assert.equal(checkContact({ name: "Ama Mensah", email: "Ama@Example.test", subject: "Hello", message: "I have a question about pricing." }).ok, true));
test("contact: header injection attempts are rejected", () => {
  for (const f of ["name", "email", "subject"] as const) {
    const base: any = { name: "Ama Mensah", email: "ama@example.test", subject: "Hello", message: "I have a question about pricing." };
    base[f] = base[f] + "\r\nBcc: victim@example.test";
    assert.equal(checkContact(base).ok, false, f);
  }
});
test("contact: honeypot, link spam and bad input", () => {
  const ok: any = { name: "Ama Mensah", email: "ama@example.test", subject: "Hello", message: "I have a question about pricing." };
  const r = checkContact({ ...ok, website: "http://spam.test" }); assert.equal(r.ok, false); assert.equal((r as any).spam, true);
  assert.equal(checkContact({ ...ok, message: "http://a.test http://b.test http://c.test http://d.test hello" }).ok, false);
  assert.equal(checkContact({ ...ok, email: "nope" }).ok, false); assert.equal(checkContact({ ...ok, message: "short" }).ok, false); assert.equal(checkContact({}).ok, false);
});

// ---- preferences & tokens ---------------------------------------------------
test("preferences: defaults, overrides, junk ignored; essential mail has no switch", () => {
  assert.deepEqual(readPrefs({}), EMAIL_PREF_DEFAULTS);
  assert.equal(readPrefs({ emailNotifications: { lowStock: false, salesSummary: "yes" } }).lowStock, false);
  assert.equal(readPrefs({ emailNotifications: { salesSummary: "yes" } }).salesSummary, false);
  assert.ok(!Object.keys(EMAIL_PREF_DEFAULTS).some((k) => /password|verif|security|reset|application/i.test(k)));
});
test("tokens: random, hashed, single hash per token", () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a.token, b.token); assert.equal(a.hash, hashToken(a.token)); assert.notEqual(a.hash, a.token); assert.ok(a.token.length >= 40);
});

// ---- service (mock provider, in-memory db) ----------------------------------
const okProvider = (calls: any[]) => async (m: any) => { calls.push(m); return { ok: true, id: "prov_" + calls.length, retryable: false }; };
test("backoff grows and attempts are capped", () => { assert.ok(backoffMs(1) < backoffMs(2) && backoffMs(2) < backoffMs(5)); assert.equal(MAX_ATTEMPTS, 5); });

test("service: kill switch records SKIPPED and never calls the provider", async () => {
  resetDb(); setEnv({}); const calls: any[] = []; setProviderForTests(okProvider(calls));
  const r = await sendEmail({ category: "auth", template: "welcome", to: "a@example.test", data: SAMPLE, key: "k1" });
  assert.equal(r.result, "skipped"); assert.equal(calls.length, 0); assert.equal(db.messages[0].status, "SKIPPED");
});
test("service: admin switch off also stops sending", async () => {
  resetDb(); setEnv(ENV); db.setting = { enabled: false, centralAddress: null }; const calls: any[] = []; setProviderForTests(okProvider(calls));
  assert.equal((await sendEmail({ category: "auth", template: "welcome", to: "a@example.test", data: SAMPLE, key: "k1" })).result, "skipped"); assert.equal(calls.length, 0);
});
test("service: sends once, records provider id, clears payload; duplicate key sends nothing", async () => {
  resetDb(); setEnv(ENV); const calls: any[] = []; setProviderForTests(okProvider(calls));
  const a = await sendEmail({ category: "auth", template: "welcome", to: "A@Example.test", data: SAMPLE, key: "welcome:1" });
  const b = await sendEmail({ category: "auth", template: "welcome", to: "a@example.test", data: SAMPLE, key: "welcome:1" });
  assert.equal(a.result, "sent"); assert.equal(b.result, "duplicate"); assert.equal(calls.length, 1);
  assert.equal(calls[0].to, "a@example.test"); assert.equal(db.messages[0].status, "SENT"); assert.equal(db.messages[0].providerId, "prov_1"); assert.equal(db.messages[0].payload, null);
});
test("service: one-time links are never stored", async () => {
  resetDb(); setEnv(ENV); const calls: any[] = []; setProviderForTests(okProvider(calls));
  await sendEmail({ category: "auth", template: "password_reset", to: "a@example.test", data: { name: "Ama" }, secret: { url: "https://app.example.test/reset-password?token=SECRETTOKEN123" }, key: "reset:1" });
  assert.ok(calls[0].html.includes("SECRETTOKEN123") && calls[0].text.includes("SECRETTOKEN123"));
  assert.ok(!JSON.stringify(db.messages).includes("SECRETTOKEN123"));
});
test("service: a failed secret email is not retried later (user must ask again)", async () => {
  resetDb(); setEnv(ENV); setProviderForTests(async () => ({ ok: false, retryable: true, status: 503, error: "down" }));
  const r = await sendEmail({ category: "auth", template: "verify_email", to: "a@example.test", data: { name: "A" }, secret: { url: "https://x.test/?token=T" }, key: "v1" });
  assert.equal(r.result, "failed"); assert.equal(db.messages[0].status, "FAILED");
});
test("service: retryable failure is queued with backoff, then sent by the outbox", async () => {
  resetDb(); setEnv(ENV); let n = 0;
  setProviderForTests(async () => (++n === 1 ? { ok: false, retryable: true, status: 429, error: "rate limited", retryAfterMs: 120000 } : { ok: true, id: "p2", retryable: false }));
  const r = await sendEmail({ category: "business", template: "low_stock", to: "a@example.test", data: SAMPLE, key: "ls:1" });
  assert.equal(r.result, "queued"); assert.equal(db.messages[0].status, "QUEUED"); assert.ok(db.messages[0].nextAttemptAt.getTime() >= Date.now() + 100000);
  assert.equal((await processOutbox()).processed, 0, "not due yet");
  db.messages[0].nextAttemptAt = new Date(Date.now() - 1000);
  const p = await processOutbox(); assert.equal(p.sent, 1); assert.equal(db.messages[0].status, "SENT");
});
test("service: gives up after the maximum attempts instead of retrying forever", async () => {
  resetDb(); setEnv(ENV); setProviderForTests(async () => ({ ok: false, retryable: true, status: 500, error: "boom" }));
  await sendEmail({ category: "business", template: "low_stock", to: "a@example.test", data: SAMPLE, key: "ls:2" });
  for (let i = 0; i < 10; i++) { db.messages[0].nextAttemptAt = new Date(Date.now() - 1000); await processOutbox(); }
  assert.equal(db.messages[0].status, "FAILED"); assert.equal(db.messages[0].attempts, MAX_ATTEMPTS);
});
test("service: permanent errors fail at once", async () => {
  resetDb(); setEnv(ENV); let calls = 0; setProviderForTests(async (m: any) => { if (!/delivery problem/i.test(m.subject)) calls++; return { ok: false, retryable: false, status: 422, error: "invalid" }; });
  const r = await sendEmail({ category: "business", template: "low_stock", to: "a@example.test", data: SAMPLE, key: "ls:3" });
  assert.equal(r.result, "failed"); assert.equal(calls, 1, "the business email is tried once, not retried");
  assert.ok(db.messages.some((m) => m.template === "admin_delivery_failure"), "the central address is told"); assert.equal(db.messages[0].status, "FAILED");
});
test("service: invalid or header-injected recipients are refused without sending", async () => {
  resetDb(); setEnv(ENV); const calls: any[] = []; setProviderForTests(okProvider(calls));
  assert.equal((await sendEmail({ category: "auth", template: "welcome", to: "not-an-email", data: SAMPLE, key: "i1" })).result, "invalid");
  assert.equal((await sendEmail({ category: "auth", template: "welcome", to: "a@example.test\r\nbcc:b@example.test", data: SAMPLE, key: "i2" })).result, "invalid");
  assert.equal(calls.length, 0);
});
test("service: API key never appears in stored errors", async () => {
  resetDb(); setEnv(ENV); setProviderForTests(async () => ({ ok: false, retryable: false, status: 401, error: "API key re_abc123_secret is invalid" }));
  await sendEmail({ category: "business", template: "low_stock", to: "a@example.test", data: SAMPLE, key: "e1" });
  assert.ok(!JSON.stringify(db.messages).includes("re_abc123_secret"));
});
test("admin routing: admin notifications go to the central Gmail unless a Super Admin overrides it", async () => {
  resetDb(); setEnv(ENV); const calls: any[] = []; setProviderForTests(okProvider(calls));
  await sendAdminNotification("admin_new_application", { businessName: "Shop" }, "a1");
  assert.equal(calls[0].to, DEFAULT_CONTACT);
  db.setting = { enabled: true, centralAddress: "owner@example.test" };
  assert.equal((await getEmailState()).centralAddress, "owner@example.test");
  db.setting = { enabled: true, centralAddress: "bad" }; assert.equal((await getEmailState()).centralAddress, DEFAULT_CONTACT);
});
test("service: Reply-To defaults to the Gmail contact", async () => {
  resetDb(); setEnv(ENV); const calls: any[] = []; setProviderForTests(okProvider(calls));
  await sendEmail({ category: "auth", template: "welcome", to: "a@example.test", data: SAMPLE, key: "r1" });
  assert.equal(calls[0].replyTo, undefined); // provider fills Reply-To from config (EMAIL_REPLY_TO / Gmail)
  assert.equal(emailConfig({}).replyTo, DEFAULT_CONTACT);
});
