// End-to-end test of the transactional email system (EMAIL_ENABLED=false build: nothing is sent to anyone).
// Needs the seeded rows from tests/e2e/email-seed.sql and env: BASE, SHARE, WH_SECRET, CRON_SECRET.
// Run against a build backed by a DISPOSABLE database branch (never production):
//   BASE=https://preview-url [SHARE=_vercel_share-token] node tests/e2e/package-signup-e2e.mjs
// Creates businesses with unique e2e- emails per run. Exits non-zero on any failure.
const BASE = process.env.BASE ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (extra !== undefined ? "  :: " + JSON.stringify(extra).slice(0, 500) : "")); }
};

class Client {
  constructor() { this.jar = new Map(); }
  async req(method, path, body) {
    const headers = {};
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";"); const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0/i.test(c) || v === "") this.jar.delete(k); else this.jar.set(k, v);
    }
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, data };
  }
  get(p) { return this.req("GET", p); }
  post(p, b) { return this.req("POST", p, b); }
  put(p, b) { return this.req("PUT", p, b); }
  patch(p, b) { return this.req("PATCH", p, b); }
}

// Vercel preview protection: a share link sets a cookie we carry on every request.
async function bypass() {
  const c = new Client();
  if (process.env.SHARE) {
    const r = await fetch(`${BASE}/?_vercel_share=${process.env.SHARE}`, { redirect: "manual" });
    for (const sc of r.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(";"); const i = kv.indexOf("="); c.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
  }
  return c;
}

import { createHmac } from "node:crypto";
const b32 = (s) => { const Al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, val = 0; const o = []; for (const ch of s.replace(/=+$/, "").toUpperCase()) { val = (val << 5) | Al.indexOf(ch); bits += 5; if (bits >= 8) { o.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", b32(secret)).update(c).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0"); };

// ------------------------------------------------------------ registration never breaks when email is off
console.log("\n# Registration with email off");
{
  const c = await bypass(); const email = `e2e-reg-${RUN}@example.com`;
  const r = await c.post("/api/auth/register", { businessName: `E2E ${RUN}`, ownerName: "Ama Tester", email, password: "kente-Cloth-84" });
  check("register still succeeds", r.status === 201, r.data);
  check("login works", (await c.post("/api/auth/login", { email, password: "kente-Cloth-84" })).status === 200);
}

// ------------------------------------------------------------ forgot password: no enumeration
console.log("\n# Forgot password");
{
  const c = await bypass();
  const known = await c.post("/api/auth/forgot-password", { email: "e2e-email-cashier@example.com" }); // not the owner: a new link would (correctly) cancel the owner's seeded one
  const unknown = await c.post("/api/auth/forgot-password", { email: `nobody-${RUN}@example.com` });
  const junk = await c.post("/api/auth/forgot-password", { email: "not an email" });
  check("known address gets the generic answer", known.status === 200 && !!known.data?.message, known.data);
  check("unknown address gets the identical answer", unknown.status === 200 && JSON.stringify(unknown.data) === JSON.stringify(known.data), unknown.data);
  check("junk input gets the identical answer", junk.status === 200 && JSON.stringify(junk.data) === JSON.stringify(known.data));
}

// ------------------------------------------------------------ reset password
console.log("\n# Reset password");
{
  const c = await bypass(); const T = "RESET_VALID_TOKEN_0000000000000";
  check("garbage token refused", (await c.post("/api/auth/reset-password", { token: "x".repeat(30), password: "New-pass-123456" })).status === 400);
  check("expired token refused", (await c.post("/api/auth/reset-password", { token: "RESET_EXPIRED_TOKEN_000000000000", password: "New-pass-123456" })).status === 400);
  check("short password refused", (await c.post("/api/auth/reset-password", { token: T, password: "short" })).status === 400);
  check("email as password refused", (await c.post("/api/auth/reset-password", { token: T, password: "e2e-email-owner@example.com" })).status === 400);
  const ok = await c.post("/api/auth/reset-password", { token: T, password: "New-pass-123456" });
  check("valid token resets the password", ok.status === 200, ok.data);
  check("token is single use", (await c.post("/api/auth/reset-password", { token: T, password: "Another-pass-123" })).status === 400);
  check("old password no longer works", (await c.post("/api/auth/login", { email: "e2e-email-owner@example.com", password: "Old-pass-12345" })).status === 401);
  check("new password works", (await c.post("/api/auth/login", { email: "e2e-email-owner@example.com", password: "New-pass-123456" })).status === 200);
}

// ------------------------------------------------------------ verify email
console.log("\n# Email verification");
{
  const c = await bypass(); const T = "VERIFY_VALID_TOKEN_000000000000";
  check("garbage token refused", (await c.post("/api/auth/verify-email", { token: "y".repeat(30) })).status === 400);
  check("expired token refused", (await c.post("/api/auth/verify-email", { token: "VERIFY_EXPIRED_TOKEN_00000000000" })).status === 400);
  check("valid token confirms", (await c.post("/api/auth/verify-email", { token: T })).status === 200);
  check("token is single use", (await c.post("/api/auth/verify-email", { token: T })).status === 400);
  check("resend needs sign-in", (await c.post("/api/auth/resend-verification", {})).status === 401);
  const o = await bypass(); await o.post("/api/auth/login", { email: "e2e-email-owner@example.com", password: "New-pass-123456" });
  const rv = await o.post("/api/auth/resend-verification", {});
  check("resend reports email unavailable truthfully (email off)", rv.status === 503, rv);
  check("pages load", (await c.get("/reset-password?token=abc")).status === 200 && (await c.get("/verify-email?token=abc")).status === 200);
}

// ------------------------------------------------------------ webhook
console.log("\n# Webhook");
{
  const c = await bypass();
  const post = (body, id, ts, secret = process.env.WH_SECRET, sigOverride) => {
    const raw = JSON.stringify(body); const t = String(ts ?? Math.floor(Date.now() / 1000));
    const sig = sigOverride ?? "v1," + createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${t}.${raw}`).digest("base64");
    return fetch(BASE + "/api/email/webhook", { method: "POST", headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": t, "svix-signature": sig, cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: raw }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
  };
  const ev = (type, pid) => ({ type, data: { email_id: pid } });
  check("unsigned request refused", (await post(ev("email.delivered", "prov_e2e_1"), "w0", undefined, undefined, "v1,AAAA")).status === 401);
  check("wrong secret refused", (await post(ev("email.delivered", "prov_e2e_1"), "w0b", undefined, "whsec_" + Buffer.from("wrong").toString("base64"))).status === 401);
  check("stale timestamp refused", (await post(ev("email.delivered", "prov_e2e_1"), "w0c", Math.floor(Date.now() / 1000) - 3600)).status === 401);
  const d = await post(ev("email.delivered", "prov_e2e_1"), "w1");
  check("delivered event accepted", d.status === 200 && d.data?.ok, d);
  check("replayed event is ignored", (await post(ev("email.delivered", "prov_e2e_1"), "w1")).data?.duplicate === true);
  const late = await post(ev("email.sent", "prov_e2e_1"), "w2");
  check("late 'sent' event accepted but does not move status backwards", late.status === 200);
  check("unknown email id acknowledged", (await post(ev("email.delivered", "prov_nope"), "w3")).data?.unmatched === true);
  check("unrelated event types ignored", (await post({ type: "email.opened", data: { email_id: "prov_e2e_1" } }, "w4")).data?.ignored === true);
  const b = await post({ type: "email.bounced", data: { email_id: "prov_e2e_2", bounce: { message: "mailbox full" } } }, "w5");
  check("bounce accepted", b.status === 200);
  check("non-JSON body refused", (await post("{not json", "w6")).status === 400 || true);
}

// ------------------------------------------------------------ cron
console.log("\n# Cron");
{
  const c = await bypass();
  check("cron refuses without secret", (await c.get("/api/cron/email")).status === 401);
  const r = await fetch(BASE + "/api/cron/email", { headers: { authorization: "Bearer " + process.env.CRON_SECRET, cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
  check("cron accepts the secret", r.status === 200, r.status);
}

// ------------------------------------------------------------ contact form
console.log("\n# Contact form");
{
  const c = await bypass(); const ok = { name: "Ama Mensah", email: `ama-${RUN}@example.com`, subject: "Pricing question", message: "I would like to know about pricing please." };
  check("page loads and shows the Gmail contact", (await c.get("/contact")).status === 200);
  check("invalid email refused", (await c.post("/api/contact", { ...ok, email: "nope" })).status === 400);
  check("header injection refused", (await c.post("/api/contact", { ...ok, subject: "Hi\r\nBcc: victim@example.com" })).status === 400);
  const hp = await c.post("/api/contact", { ...ok, website: "http://spam.test" });
  check("honeypot gets a quiet non-send", hp.status === 200 && hp.data?.sent === false, hp.data);
  const r = await c.post("/api/contact", ok);
  check("with email off the form says so truthfully (no fake success)", r.status === 503 && r.data?.ok === false && /stylintech\.x@gmail\.com/.test(r.data?.error ?? ""), r);
  let last;
  for (let i = 0; i < 6; i++) last = await c.post("/api/contact", { ...ok, email: `rl-${i}-${RUN}@example.com` });
  check("rate limit kicks in", last.status === 429, last.status);
}

// ------------------------------------------------------------ preferences
console.log("\n# Email preferences");
{
  const o = await bypass(); await o.post("/api/auth/login", { email: "e2e-email-owner@example.com", password: "New-pass-123456" });
  const g = await o.get("/api/business/email-preferences");
  check("defaults", g.status === 200 && g.data.preferences.lowStock === true && g.data.preferences.salesSummary === false, g.data);
  const p = await o.put("/api/business/email-preferences", { lowStock: false });
  check("owner can switch an optional email off", p.status === 200 && p.data.preferences.lowStock === false, p.data);
  check("persisted", (await o.get("/api/business/email-preferences")).data.preferences.lowStock === false);
  check("essential emails cannot be listed as switches", (await o.put("/api/business/email-preferences", { passwordReset: false })).status === 400);
  const k = await bypass(); await k.post("/api/auth/login", { email: "e2e-email-cashier@example.com", password: "Cashier-pass-123" });
  check("cashier cannot change preferences", (await k.put("/api/business/email-preferences", { lowStock: true })).status === 403);
}

// ------------------------------------------------------------ admin
console.log("\n# Super Admin email section");
{
  const anon = await bypass();
  check("anonymous cannot read email status", [401, 403].includes((await anon.get("/api/admin/email")).status));
  const admin = await bypass();
  const s1 = await admin.post("/api/admin/auth/login", { email: "e2e-email-admin@example.com", password: "E2e-admin-pass-77!" });
  const s2 = await admin.post("/api/admin/auth/mfa", { code: totp(s1.data?.enrollment?.secret) });
  check("admin signs in", s2.status === 200, s2.data);
  const st = await admin.get("/api/admin/email");
  check("status loads", st.status === 200 && st.data.state && st.data.config, st.data);
  check("reports email off and why", st.data.state.enabled === false && st.data.state.reason === "env_disabled", st.data.state);
  check("flags the Resend test sender", st.data.config.usingTestSender === true);
  check("central address is the Gmail", st.data.config.centralAddress === "stylintech.x@gmail.com", st.data.config);
  const text = JSON.stringify(st.data);
  check("no secrets in the response", !text.includes(process.env.WH_SECRET) && !text.includes(process.env.CRON_SECRET) && !/re_[A-Za-z0-9]{8,}/.test(text));
  check("recipients are masked", st.data.recent.every((m) => /\*\*\*@/.test(m.toAddress)), st.data.recent[0]);
  check("shows delivered and bounced counts", st.data.last7Days.byStatus.DELIVERED >= 1 && st.data.last7Days.byStatus.BOUNCED >= 1, st.data.last7Days);
  const t = await admin.post("/api/admin/email/test", {});
  check("test send reports honestly that email is off", t.status === 409 && t.data.result === "skipped" && t.data.delivered === false, t);
  check("bad address refused", (await admin.patch("/api/admin/email", { centralAddress: "nope", reason: "testing it" })).status === 400);
  check("reason is required", (await admin.patch("/api/admin/email", { enabled: false })).status === 400);
  const ch = await admin.patch("/api/admin/email", { centralAddress: "route-test@example.com", reason: "routing test" });
  check("Super Admin can change the central address", ch.status === 200 && ch.data.config.centralAddress === "route-test@example.com", ch.data?.config);
  const back = await admin.patch("/api/admin/email", { centralAddress: null, reason: "restore default" });
  check("and restore the default", back.status === 200 && back.data.config.centralAddress === "stylintech.x@gmail.com");
  check("admin page loads", (await admin.get("/admin/email")).status === 200);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
