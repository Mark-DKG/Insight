// End-to-end test of signup → package choice → gated store access → seller application rules.
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
async function newOwner(tag) {
  const c = await bypass();
  const email = `e2e-${tag}-${RUN}@example.com`;
  const r = await c.post("/api/auth/register", { businessName: `E2E ${tag} ${RUN}`, ownerName: "Ama Tester", email, password: "kente-Cloth-84" });
  const l = await c.post("/api/auth/login", { email, password: "kente-Cloth-84" });
  return { c, email, reg: r, login: l };
}

const GOOD = {
  registeredName: "Ama Traders Ltd", tradingName: "Ama Shop", businessType: "Partnership", description: "We sell clothing.",
  address: "12 High Street", country: "Ghana", region: "Ashanti", city: "Kumasi", phone: "0241234567", email: "ama@example.com",
  repName: "Ama Mensah", repPosition: "Owner", repPhone: "0501234567", repEmail: "ama@example.com",
  categories: ["Fashion"], productCount: "1–20", onlinePresence: "instagram.com/ama", fulfilment: "Rider delivery",
  offersCollection: true,
};
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const png = (name) => { const fd = new FormData(); fd.append("file", new Blob([PNG], { type: "image/png" }), name); return fd; };

// ---------------------------------------------------------------- signup restrictions
console.log("\n# Signup");
const a = await newOwner("inv");
check("register succeeds", a.reg.status === 201, a.reg);
check("login succeeds", a.login.status === 200, a.login);
const bad = await (await bypass()).post("/api/auth/register", { businessName: "X", ownerName: "Y", email: "not-an-email", password: "kente-Cloth-84" });
check("register rejects a bad email", bad.status === 400);
let m = await a.c.get("/api/business/mode");
check("new owner has not chosen a package", m.data.packageSelected === false, m.data);
check("new owner starts on the most restricted package", m.data.mode === "INVENTORY_ONLY", m.data);
check("POS/sales blocked before choosing", (await a.c.get("/api/sales")).status === 403);
check("customers blocked before choosing", (await a.c.get("/api/customers")).status === 403);
check("store seller area blocked before choosing", [403, 404].includes((await a.c.get("/api/seller/listings")).status));
check("inventory is available before choosing", (await a.c.get("/api/products")).status === 200);

// ---------------------------------------------------------------- non-store packages apply at once
console.log("\n# Packages without Insight Store apply immediately");
const pos = await newOwner("pos");
let r = await pos.c.put("/api/business/mode", { mode: "POS_INVENTORY", confirm: true });
check("POS and Inventory applies", r.status === 200 && r.data.mode === "POS_INVENTORY" && !r.data.pending, r.data);
m = await pos.c.get("/api/business/mode");
check("package now marked as chosen", m.data.packageSelected === true && m.data.mode === "POS_INVENTORY", m.data);
check("POS module now open", (await pos.c.get("/api/sales")).status === 200);
r = await a.c.put("/api/business/mode", { mode: "INVENTORY_ONLY", confirm: true });
m = await a.c.get("/api/business/mode");
check("Inventory Only applies and is marked chosen", r.status === 200 && m.data.packageSelected === true && m.data.mode === "INVENTORY_ONLY", m.data);
check("no seller application for non-store package", (await a.c.get("/api/seller/status")).data?.application == null);

// ---------------------------------------------------------------- store packages wait for approval
console.log("\n# Store packages need approval");
const st = await newOwner("store");
r = await st.c.put("/api/business/mode", { mode: "STORE_INVENTORY", confirm: true });
check("Store and Inventory is held pending", r.status === 200 && r.data.pending === "STORE_INVENTORY", r.data);
check("holding package has NO store and NO POS", r.data.mode === "INVENTORY_ONLY", r.data);
check("note mentions the approval window", /2 to 18 days/.test(r.data.note ?? ""), r.data.note);
m = await st.c.get("/api/business/mode");
check("mode API reports the pending package", m.data.pendingMode === "STORE_INVENTORY" && m.data.packageSelected === true, m.data);
let s = await st.c.get("/api/seller/status");
check("an application was opened as a draft", s.data.application?.status === "DRAFT", s.data.application?.status);
check("status states the 2 to 18 day window", s.data.approvalWindow === "2 to 18 days", s.data.approvalWindow);
check("store selling is blocked until approved", s.data.canSell === false);
check("seller listing API blocked until approved", (await st.c.get("/api/seller/listings")).status === 403);
check("POS still blocked on a store-only hold", (await st.c.get("/api/sales")).status === 403);
// While waiting for approval the owner can reach NOTHING but the application and package screens.
check("mode API says the business is locked", m.data.locked === true, m.data);
for (const [name, path] of [["products", "/api/products"], ["inventory movements", "/api/inventory/movements"], ["suppliers", "/api/suppliers"], ["purchases", "/api/purchases"], ["reports", "/api/reports/profit"], ["customers", "/api/customers"], ["expenses", "/api/expenses"], ["employees", "/api/employees"], ["branches", "/api/branches"]]) {
  const rr = await st.c.get(path);
  check(`locked: ${name} API refused`, rr.status === 403, { path, status: rr.status });
}
check("locked: cannot create a product", (await st.c.post("/api/products", { name: "X", sku: "X1", costPrice: 1, sellingPrice: 2, minStockLevel: 1 })).status === 403);
check("locked: application status is still reachable", (await st.c.get("/api/seller/status")).status === 200);
check("locked: sign-in identity still reachable", (await st.c.get("/api/auth/me")).data?.locked === true);
const appId = s.data.application.id;

const full = await newOwner("full");
r = await full.c.put("/api/business/mode", { mode: "FULL", confirm: true });
check("Full is held pending too", r.status === 200 && r.data.pending === "FULL", r.data);
check("Full is also locked: holding package is the restricted one", r.data.mode === "INVENTORY_ONLY", r.data);
check("POS blocked while Full awaits approval", (await full.c.get("/api/sales")).status === 403);
check("inventory blocked while Full awaits approval", (await full.c.get("/api/products")).status === 403);
check("Full owner is marked locked", (await full.c.get("/api/business/mode")).data?.locked === true);
check("store blocked while Full awaits approval", (await full.c.get("/api/seller/listings")).status === 403);

// ---------------------------------------------------------------- application rules
console.log("\n# Application form rules");
const A = `/api/seller/applications/${appId}`;
r = await st.c.post(`${A}/submit`, {});
check("untouched application cannot be submitted", r.status === 400 && r.data.fields?.tradingName && r.data.fields?.city, r.data);
r = await st.c.patch(A, { data: { ...GOOD, email: "ama@@example" } });
check("bad business email is rejected", r.status === 400, r.data);
r = await st.c.patch(A, { data: { ...GOOD, repEmail: "nope" } });
check("bad representative email is rejected", r.status === 400, r.data);
r = await st.c.patch(A, { data: { ...GOOD, phone: "02412345678" } });
check("Ghana phone of 11 digits is rejected", r.status === 400 && /10 digits/.test(r.data.error), r.data);
r = await st.c.patch(A, { data: { ...GOOD, repPhone: "+233501234567" } });
check("Ghana phone with +233 is rejected (digits only, max 10)", r.status === 400, r.data);
r = await st.c.patch(A, { data: { ...GOOD, country: "Nigeria", region: "Lagos", city: "Lagos", phone: "+234 803 123 4567", repPhone: "+234 803 123 4568" } });
check("longer international numbers are fine outside Ghana", r.status === 200, r.data);

// each compulsory field, blanked one at a time
const required = ["registeredName", "tradingName", "businessType", "description", "address", "country", "region", "city", "phone", "email", "repName", "repPosition", "repPhone", "repEmail", "categories", "productCount", "onlinePresence", "fulfilment"];
let allRequired = true; const notEnforced = [];
for (const k of required) {
  await st.c.patch(A, { data: { ...GOOD, [k]: k === "categories" ? [] : "" } });
  const rr = await st.c.post(`${A}/submit`, {});
  if (!(rr.status === 400 && rr.data?.fields?.[k])) { allRequired = false; notEnforced.push(k); }
}
check("every box except registration number is compulsory", allRequired, notEnforced);
r = await st.c.patch(A, { data: { ...GOOD, registrationNumber: "" } });
r = await st.c.post(`${A}/submit`, {}); // no shop, no ID yet
check("ID photo is compulsory even without a physical shop", r.status === 400 && /Ghana Card or Voter's ID/.test(r.data.error ?? ""), r.data);
r = await st.c.post(`${A}/documents`, (() => { const fd = png("ghana-card.png"); fd.append("docKey", "owner_id"); return fd; })());
check("ID photo uploads", r.status === 201, r.data);
r = await st.c.post(`${A}/submit`, {});
check("registration number is optional (application submits without it)", r.status === 200 && r.data.application?.status === "SUBMITTED", r.data);
check("still locked after submitting", (await st.c.get("/api/products")).status === 403);

// physical shop rules on the "full" owner's application
s = await full.c.get("/api/seller/status");
const B = `/api/seller/applications/${s.data.application.id}`;
await full.c.patch(B, { data: { ...GOOD, physicalPresence: true } });
r = await full.c.post(`${B}/submit`, {});
check("physical shop requires a shop address", r.status === 400 && r.data.fields?.shopAddress, r.data);
await full.c.patch(B, { data: { physicalPresence: true, shopAddress: "Stall 4, Kejetia Market, Kumasi" } });
r = await full.c.post(`${B}/submit`, {});
check("physical shop requires a Ghana Card / Voter's ID photo", r.status === 400 && /Ghana Card or Voter's ID/.test(r.data.error), r.data);
s = await full.c.get("/api/seller/status");
check("the ID document is listed as required", (s.data.requiredDocuments ?? []).some((d) => d.key === "owner_id" && d.required));
r = await full.c.post(`${B}/documents`, (() => { const fd = png("ghana-card.png"); fd.append("docKey", "owner_id"); return fd; })());
check("ID photo uploads", r.status === 201, r.data);
r = await full.c.post(`${B}/submit`, {});
check("physical shop submits once address and ID are in", r.status === 200 && r.data.application?.status === "SUBMITTED", r.data);
r = await full.c.patch(B, { data: { city: "Accra" } });
check("submitted application can't be edited", r.status === 409);

// still waiting after submit
m = await full.c.get("/api/business/mode");
check("package still pending after submit (needs approval)", m.data.pendingMode === "FULL" && m.data.mode === "INVENTORY_ONLY" && m.data.locked === true, m.data);
check("store still blocked after submit", (await full.c.get("/api/seller/listings")).status === 403);

// Unknown doc key still refused
const x = await newOwner("dockey");
await x.c.put("/api/business/mode", { mode: "STORE_INVENTORY", confirm: true });
const xs = await x.c.get("/api/seller/status");
r = await x.c.post(`/api/seller/applications/${xs.data.application.id}/documents`, (() => { const fd = png("a.png"); fd.append("docKey", "bogus"); return fd; })());
check("unknown document type refused", r.status === 400);

// A locked owner can choose a package that needs no approval, which unlocks the app.
r = await x.c.put("/api/business/mode", { mode: "POS_INVENTORY", confirm: true });
check("locked owner can switch to a package without the store", r.status === 200 && r.data.mode === "POS_INVENTORY" && !r.data.pending, r.data);
m = await x.c.get("/api/business/mode");
check("switching unlocks the app", m.data.locked === false && (await x.c.get("/api/products")).status === 200, m.data);

// Approval unlocks (needs a disposable platform admin: ADMIN_EMAIL / ADMIN_PASSWORD).
if (process.env.ADMIN_EMAIL) {
  const { createHmac } = await import("node:crypto");
  const b32 = (s) => { const Al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, val = 0; const o = []; for (const ch of s.replace(/=+$/, "").toUpperCase()) { val = (val << 5) | Al.indexOf(ch); bits += 5; if (bits >= 8) { o.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
  const totp = (secret) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", b32(secret)).update(c).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0"); };
  const admin = await bypass();
  const s1 = await admin.post("/api/admin/auth/login", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  const s2 = await admin.post("/api/admin/auth/mfa", { code: totp(s1.data?.enrollment?.secret ?? process.env.ADMIN_TOTP_SECRET) });
  check("admin signs in", s2.status === 200, s2.data);
  const rej = await admin.post(`/api/admin/store/applications/${B.split("/").pop()}/action`, { action: "reject", message: "Photo unclear" });
  check("admin rejects the Full application", rej.status === 200, rej.data);
  check("rejected owner stays locked (can still pick another package)", (await full.c.get("/api/business/mode")).data?.locked === true && (await full.c.get("/api/products")).status === 403);
  const ap = await admin.post(`/api/admin/store/applications/${appId}/action`, { action: "approve" });
  check("admin approves the Store and Inventory application", ap.status === 200 && ap.data?.packageApplied === "STORE_INVENTORY", ap.data);
  m = await st.c.get("/api/business/mode");
  check("approval unlocks the owner on the requested package", m.data.locked === false && m.data.mode === "STORE_INVENTORY" && !m.data.pendingMode, m.data);
  check("inventory works after approval", (await st.c.get("/api/products")).status === 200);
  check("store seller area works after approval", (await st.c.get("/api/seller/listings")).status === 200);
  check("POS still excluded on Store and Inventory", (await st.c.get("/api/sales")).status === 403);
}

// Landing/choose-package page and geo data are reachable
const pub = await bypass();
const gi = await pub.get("/geo/index.json");
check("country list served", gi.status === 200 && Array.isArray(gi.data) && gi.data.length > 200, gi.status);
const gg = await pub.get("/geo/ghana.json");
check("Ghana has all 16 regions", gg.status === 200 && gg.data.regions.length === 16, gg.data?.regions?.length);
check("every Ghana region lists cities", gg.data?.regions?.every((q) => q.c.length > 0));
check("choose-package page requires sign-in", (await pub.get("/choose-package")).status !== 200);
check("choose-package page loads when signed in", (await a.c.get("/choose-package")).status === 200);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
