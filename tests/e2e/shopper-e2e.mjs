// End-to-end test of Insight Store shopper accounts against a build backed by a
// DISPOSABLE database branch (never production).
//   BASE=https://preview [SHARE=token] ADMIN_EMAIL=e2e-... ADMIN_PASSWORD=... node tests/e2e/shopper-e2e.mjs
// Needs the E2E platform admin from make-admin.mjs. Creates one seller and a
// published listing, then exercises guest vs. account shoppers.
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (extra !== undefined ? "  :: " + JSON.stringify(extra).slice(0, 500) : "")); }
};

class Client {
  constructor(name) { this.name = name; this.jar = new Map(); }
  async req(method, path, body) {
    const headers = {};
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    const cookies = res.headers.getSetCookie?.() ?? [];
    for (const c of cookies) {
      const [kv] = c.split(";"); const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0/i.test(c) || v === "") this.jar.delete(k); else this.jar.set(k, v);
    }
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, data, cookies, headers: res.headers };
  }
  get(p) { return this.req("GET", p); }
  post(p, b) { return this.req("POST", p, b); }
  put(p, b) { return this.req("PUT", p, b); }
  patch(p, b) { return this.req("PATCH", p, b); }
  del(p, b) { return this.req("DELETE", p, b); }
}
async function client(name) {
  const c = new Client(name);
  if (process.env.SHARE) {
    const r = await fetch(`${BASE}/?_vercel_share=${process.env.SHARE}`, { redirect: "manual" });
    for (const sc of r.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(";"); const i = kv.indexOf("="); c.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
  }
  return c;
}
function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, val = 0; const out = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082", "hex");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const file = (buf, name, type) => { const fd = new FormData(); fd.append("file", new Blob([buf], { type }), name); return fd; };

const GOOD = {
  registeredName: "Ama Traders Ltd", tradingName: "Ama Shop", businessType: "Partnership", description: "We sell groceries.",
  address: "12 High Street", country: "Ghana", region: "Greater Accra", city: "Accra", phone: "0241234567", email: `seller-${RUN}@example.com`,
  repName: "Ama Mensah", repPosition: "Owner", repPhone: "0501234567", repEmail: `seller-${RUN}@example.com`,
  categories: ["Groceries"], productCount: "1–20", onlinePresence: "instagram.com/ama", fulfilment: "Collection", offersCollection: true,
};
const PW = "kente-Cloth-84";

async function main() {
  // ---- Seller with one published listing -----------------------------------------------
  const S = await client("seller");
  const sEmail = `e2e-seller-${RUN}@example.com`;
  await S.post("/api/auth/register", { businessName: `E2E Seller ${RUN}`, ownerName: "Seller", email: sEmail, password: PW });
  await S.post("/api/auth/login", { email: sEmail, password: PW });
  const me = await S.get("/api/auth/me"); const branchId = me.data?.user?.branchId;
  const p = await S.post("/api/products", { name: "E2E Rice 5kg", sku: `RICE-${RUN}`, costPrice: 36, sellingPrice: 72, minStockLevel: 1 });
  const pid = p.data?.product?.id;
  await S.post("/api/inventory/adjust", { productId: pid, branchId, type: "STOCK_IN", quantity: 20, reason: "e2e" });
  const mode = await S.put("/api/business/mode", { mode: "STORE_INVENTORY", confirm: true });
  const appId = mode.data?.applicationId;
  await S.patch(`/api/seller/applications/${appId}`, { data: GOOD });
  const fd = file(PDF, "reg.pdf", "application/pdf"); fd.append("docKey", "registration");
  await S.post(`/api/seller/applications/${appId}/documents`, fd);
  const sub = await S.post(`/api/seller/applications/${appId}/submit`, {});
  check("setup: seller application submitted", sub.status === 200, sub.data);
  const admin = await client("admin");
  const s1 = await admin.post("/api/admin/auth/login", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  const s2 = await admin.post("/api/admin/auth/mfa", { code: totp(s1.data?.enrollment?.secret ?? process.env.ADMIN_TOTP_SECRET) });
  check("setup: admin signed in", s2.status === 200, s2.data);
  const ap = await admin.post(`/api/admin/store/applications/${appId}/action`, { action: "approve" });
  check("setup: seller approved", ap.status === 200, ap.data);
  await S.patch("/api/seller/profile", { whatsappNumber: "024 123 4567", offersCollection: true, offersDelivery: true });
  const cats = await S.get("/api/store/public/categories");
  const lst = await S.post("/api/seller/listings", { productId: pid });
  const listing = lst.data?.listing?.id;
  await S.post(`/api/seller/listings/${listing}/images`, file(PNG, "rice.png", "image/png"));
  await S.patch(`/api/seller/listings/${listing}`, { categoryId: cats.data?.categories?.[0]?.id, description: "Rice" });
  await S.post(`/api/seller/listings/${listing}/action`, { action: "submit" });
  const pub = await admin.post(`/api/admin/store/listings/${listing}/action`, { action: "approve" });
  check("setup: listing published", pub.data?.status === "PUBLISHED", pub.data);

  // ---- Registration -----------------------------------------------------------------------
  console.log("\n# Shopper registration");
  const email = `Shopper-${RUN}@Example.com`;
  const g = await client("shopper");
  const me0 = await g.get("/api/store/public/account/me");
  check("signed-out me is empty, not an error", me0.status === 200 && !me0.data?.shopper, me0);
  const ords0 = await g.get("/api/store/public/account/orders");
  check("orders require sign-in", ords0.status === 401, ords0.status);
  for (const [label, body] of [
    ["short password", { name: "Kofi Boateng", email, password: "abc123" }],
    ["common password", { name: "Kofi Boateng", email, password: "password123" }],
    ["password containing the email", { name: "Kofi Boateng", email, password: `${email.split("@")[0]}99` }],
    ["bad email", { name: "Kofi Boateng", email: "nope", password: PW }],
    ["bad phone", { name: "Kofi Boateng", email, password: PW, phone: "12" }],
    ["no name", { name: "", email, password: PW }],
  ]) {
    const r = await g.post("/api/store/public/account/register", body);
    check(`register rejects ${label}`, r.status === 400, r.data);
  }
  const reg = await g.post("/api/store/public/account/register", { name: "Kofi Boateng", email, password: PW, phone: "024 400 0000" });
  check("register succeeds and signs in", reg.status === 201 && reg.data?.shopper?.name === "Kofi Boateng", reg.data);
  check("email stored lower-case", reg.data?.shopper?.email === email.toLowerCase(), reg.data);
  check("response never contains the password hash", !/passwordHash|\$2[aby]\$/.test(JSON.stringify(reg.data)), reg.data);
  const sc = reg.cookies.find((c) => /shopper/i.test(c));
  check("session cookie is HttpOnly, SameSite and scoped", !!sc && /httponly/i.test(sc) && /samesite=/i.test(sc), sc);
  const meIn = await g.get("/api/store/public/account/me");
  check("me returns the signed-in shopper", meIn.data?.shopper?.email === email.toLowerCase(), meIn.data);
  const dup = await (await client("dup")).post("/api/store/public/account/register", { name: "Other", email: email.toUpperCase(), password: PW });
  check("duplicate email (any case) is refused", dup.status === 409, dup.data);

  // ---- Logout / login / lockout --------------------------------------------------------------
  console.log("\n# Sign in and out");
  const out = await g.post("/api/store/public/account/logout");
  check("logout ok", out.status === 200, out.status);
  check("after logout me is empty", !(await g.get("/api/store/public/account/me")).data?.shopper);
  const g2 = await client("shopper2");
  const bad = await g2.post("/api/store/public/account/login", { email, password: "wrong-password-1" });
  const none = await g2.post("/api/store/public/account/login", { email: `nobody-${RUN}@example.com`, password: "wrong-password-1" });
  check("wrong password and unknown email give the same message", bad.status === 401 && none.status === 401 && bad.data?.error === none.data?.error, [bad.data, none.data]);
  const ok = await g2.post("/api/store/public/account/login", { email: email.toUpperCase(), password: PW });
  check("login works with different email casing", ok.status === 200 && ok.data?.shopper?.name === "Kofi Boateng", ok.data);
  check("login succeeded: orders list empty", (await g2.get("/api/store/public/account/orders")).data?.orders?.length === 0);

  // ---- Profile and password ---------------------------------------------------------------------
  console.log("\n# Profile and password");
  const pr = await g2.patch("/api/store/public/account/profile", { name: "Kofi B. Boateng", phone: "0244000000", defaultAddress: "5 Ring Rd, Accra" });
  check("profile update saves name, phone and address", pr.status === 200 && pr.data?.shopper?.defaultAddress === "5 Ring Rd, Accra", pr.data);
  check("profile rejects a bad phone", (await g2.patch("/api/store/public/account/profile", { name: "Kofi", phone: "1" })).status === 400);
  check("profile requires sign-in", (await (await client("anon")).patch("/api/store/public/account/profile", { name: "Kofi" })).status === 401);
  const g3 = await client("shopper3");
  await g3.post("/api/store/public/account/login", { email, password: PW });
  const wrongCur = await g2.post("/api/store/public/account/password", { currentPassword: "nope-nope-1", newPassword: "ananse-Web-2291" });
  check("password change needs the right current password", wrongCur.status === 403, wrongCur.data);
  const weak = await g2.post("/api/store/public/account/password", { currentPassword: PW, newPassword: "short" });
  check("password change enforces strength", weak.status === 400, weak.data);
  const chg = await g2.post("/api/store/public/account/password", { currentPassword: PW, newPassword: "ananse-Web-2291" });
  check("password change succeeds", chg.status === 200, chg.data);
  check("other sessions are signed out after password change", !(await g3.get("/api/store/public/account/me")).data?.shopper);
  check("current session survives", !!(await g2.get("/api/store/public/account/me")).data?.shopper);
  const oldPw = await (await client("old")).post("/api/store/public/account/login", { email, password: PW });
  check("old password no longer works", oldPw.status === 401, oldPw.status);
  const PW2 = "ananse-Web-2291";

  // ---- Orders link to the account -----------------------------------------------------------------
  console.log("\n# Orders");
  const add = await g2.post("/api/store/public/cart", { listingId: listing, quantity: 2 });
  const sellerId = add.data?.lines?.[0]?.seller?.businessId;
  const key = `e2e-${RUN}-shopper-order-1`;
  const co = await g2.post("/api/store/public/checkout", { idempotencyKey: key, customerName: "Kofi Boateng", customerPhone: "0244000000", fulfilment: { [sellerId]: "COLLECTION" } });
  check("signed-in checkout succeeds", co.status === 201 && co.data?.orders?.length === 1, co.data);
  const ref = co.data?.orders?.[0]?.reference;
  const mine = await g2.get("/api/store/public/account/orders");
  check("order appears in the account's list", (mine.data?.orders ?? []).some((o) => o.reference === ref && o.itemCount === 2), mine.data);
  const gg = await client("guestbuyer");
  await gg.post("/api/store/public/cart", { listingId: listing, quantity: 1 });
  const gco = await gg.post("/api/store/public/checkout", { idempotencyKey: `e2e-${RUN}-guest-order-1`, customerName: "Guest Buyer", customerPhone: "0555000000", fulfilment: { [sellerId]: "COLLECTION" } });
  check("guest checkout still works", gco.status === 201, gco.data);
  const mine2 = await g2.get("/api/store/public/account/orders");
  check("guest order is not in the account's list", !(mine2.data?.orders ?? []).some((o) => o.reference === gco.data?.orders?.[0]?.reference), mine2.data);
  const other = await client("other");
  await other.post("/api/store/public/account/register", { name: "Other Person", email: `other-${RUN}@example.com`, password: "mango-Tree-5521" });
  const theirs = await other.get("/api/store/public/account/orders");
  check("another shopper sees none of these orders", theirs.data?.orders?.length === 0, theirs.data);
  const tok = new URLSearchParams(co.data.orders[0].statusPath.split("?")[1]).get("t");
  const view = await g2.get(`/api/store/public/orders/${ref}`);
  check("signed-in owner can open own order without a token", view.status === 200 && view.data?.order?.reference === ref, view.status);
  const noView = await other.get(`/api/store/public/orders/${ref}`);
  check("another shopper cannot open it without a token", noView.status === 404, noView.status);
  const tokView = await (await client("tokenviewer")).get(`/api/store/public/orders/${ref}?t=${tok}`);
  check("token link still works for anyone holding it", tokView.status === 200, tokView.status);

  // ---- Lockout -----------------------------------------------------------------------------------------
  console.log("\n# Lockout");
  const lk = await client("lock");
  let last;
  for (let i = 0; i < 5; i++) last = await lk.post("/api/store/public/account/login", { email: `other-${RUN}@example.com`, password: "wrong-wrong-77" });
  const locked = await lk.post("/api/store/public/account/login", { email: `other-${RUN}@example.com`, password: "mango-Tree-5521" });
  check("five wrong passwords lock the account (even the right password is refused)", locked.status === 429, [last.status, locked.status, locked.data]);
  const unaffected = await (await client("unaffected")).post("/api/store/public/account/login", { email, password: PW2 });
  check("lockout is per account (other accounts unaffected)", unaffected.status === 200, unaffected.status);

  // ---- Delete account -------------------------------------------------------------------------------------
  console.log("\n# Delete account");
  const delBad = await g2.del("/api/store/public/account/profile", { password: "wrong-pass-1234" });
  check("delete needs the right password", delBad.status === 403, delBad.data);
  const del = await g2.del("/api/store/public/account/profile", { password: PW2 });
  check("delete succeeds", del.status === 200, del.data);
  check("deleted: signed out", !(await g2.get("/api/store/public/account/me")).data?.shopper);
  check("deleted: cannot log in", (await (await client("gone")).post("/api/store/public/account/login", { email, password: PW2 })).status === 401);
  const kept = await S.get("/api/seller/orders");
  check("seller still sees the order after the shopper deleted their account", (kept.data?.orders ?? []).some((o) => o.reference === ref), kept.data?.orders?.length);

  // ---- Pages ---------------------------------------------------------------------------------------------------
  console.log("\n# Pages");
  const store = await (await client("pg")).get("/store");
  check("/store renders for guests", store.status === 200, store.status);
  const acct = await (await client("pg2")).get("/store/account");
  check("/store/account renders", acct.status === 200, acct.status);
  const robots = await (await client("pg3")).get("/robots.txt");
  check("robots disallows /store/account", /Disallow:\s*\/store\/account/.test(robots.data), robots.data);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error("ERROR", e); process.exit(2); });
