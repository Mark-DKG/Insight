// End-to-end test of Insight Store against a running build and a real
// Postgres database (use a disposable database branch, never production).
//
//   BASE=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/e2e/store-e2e.mjs
//
// The admin must exist with mfaEnabled=false (the script enrols MFA itself)
// and a role that includes marketplace.manage. Creates two businesses with
// unique emails per run. Prints PASS/FAIL per check and exits non-zero on any failure.
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (extra !== undefined ? "  :: " + JSON.stringify(extra).slice(0, 400) : "")); }
};

class Client {
  constructor(name) { this.name = name; this.jar = new Map(); }
  async req(method, path, body, opts = {}) {
    const headers = { ...(opts.headers ?? {}) };
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0/i.test(c) || v === "") this.jar.delete(k); else this.jar.set(k, v);
    }
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  get(p, o) { return this.req("GET", p, undefined, o); }
  post(p, b, o) { return this.req("POST", p, b, o); }
  put(p, b) { return this.req("PUT", p, b); }
  patch(p, b) { return this.req("PATCH", p, b); }
  del(p) { return this.req("DELETE", p); }
}

// RFC 6238 TOTP (same algorithm as lib/admin/totp.ts).
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

async function business(label) {
  const c = new Client(label);
  const email = `e2e-${label}-${RUN}@example.test`;
  const reg = await c.post("/api/auth/register", { businessName: `E2E ${label} ${RUN}`, ownerName: `Owner ${label}`, email, password: "Passw0rd!e2e" });
  check(`${label}: registration succeeds`, reg.status === 201 || reg.status === 200, reg);
  check(`${label}: registration response says nothing about Insight Store`, !/store|seller/i.test(JSON.stringify(reg.data ?? "")), reg.data);
  const login = await c.post("/api/auth/login", { email, password: "Passw0rd!e2e" });
  check(`${label}: login`, login.status === 200, login);
  const me = await c.get("/api/auth/me");
  c.branchId = me.data?.user?.branchId;
  return c;
}

async function product(c, name, sku, price, qty, min = 2) {
  const p = await c.post("/api/products", { name, sku, costPrice: price / 2, sellingPrice: price, minStockLevel: min });
  check(`${c.name}: create product ${sku}`, p.status === 201, p);
  const id = p.data?.product?.id;
  const adj = await c.post("/api/inventory/adjust", { productId: id, branchId: c.branchId, type: "STOCK_IN", quantity: qty, reason: "e2e opening stock" });
  check(`${c.name}: stock in ${qty} × ${sku}`, adj.status === 201, adj);
  return id;
}
const stockOf = async (c, productId) => {
  const r = await c.get(`/api/seller/listings?candidates=1`);
  const l = await c.get(`/api/seller/listings`);
  const hit = (l.data?.listings ?? []).find((x) => x.productId === productId) ?? (r.data?.products ?? []).find((x) => x.id === productId);
  return hit?.available;
};

async function adminLogin() {
  const a = new Client("admin");
  const s1 = await a.post("/api/admin/auth/login", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  check("admin: password step", s1.status === 200 && (s1.data?.step === "enroll" || s1.data?.step === "mfa"), s1);
  const secret = s1.data?.enrollment?.secret ?? process.env.ADMIN_TOTP_SECRET;
  const s2 = await a.post("/api/admin/auth/mfa", { code: totp(secret) });
  check("admin: MFA step creates a session", s2.status === 200, s2);
  return a;
}

async function main() {
  const health = await fetch(BASE + "/login").then((r) => r.status).catch(() => 0);
  check("server reachable", health === 200, health);

  // ---- Businesses and products ---------------------------------------------------
  const A = await business("alpha");
  const B = await business("beta");
  const pA = await product(A, "E2E Rice 5kg", `RICE-${RUN}`, 72, 3, 1);
  const pB = await product(B, "E2E Kente Scarf", `KENTE-${RUN}`, 90, 5);

  // ---- Notifications baseline ----------------------------------------------------
  const n0 = await A.get("/api/notifications");
  check("notifications API returns own list with unread count", n0.status === 200 && Array.isArray(n0.data?.items) && typeof n0.data?.unread === "number", n0);

  // ---- Stage 2: application via package upgrade (A) ------------------------------
  const st0 = await A.get("/api/seller/status");
  check("A: no application or seller before applying", st0.status === 200 && !st0.data.application && !st0.data.seller, st0.data);
  const mode = await A.put("/api/business/mode", { mode: "STORE_INVENTORY", confirm: true });
  check("A: Store and Inventory without approval is held pending", mode.status === 200 && mode.data.pending === "STORE_INVENTORY" && mode.data.changed === false && mode.data.applicationId, mode.data);
  const m1 = await A.get("/api/business/mode");
  check("A: package unchanged while pending", m1.data?.mode === "FULL" && m1.data?.pendingMode === "STORE_INVENTORY", m1.data);
  const blocked = await A.get("/api/seller/listings");
  check("A: seller APIs refused before approval", blocked.status === 403 && blocked.data?.code === "STORE_NOT_AVAILABLE", blocked);
  const appId = mode.data.applicationId;
  const again = await A.post("/api/seller/applications", {});
  check("A: second application resumes the open one", again.data?.application?.id === appId && again.data?.resumed === true, again.data);

  const early = await A.post(`/api/seller/applications/${appId}/submit`, {});
  check("A: incomplete application cannot be submitted", early.status === 400 && /complete/i.test(early.data?.error ?? ""), early.data);
  const answers = {
    registeredName: `E2E alpha ${RUN}`, businessType: "Sole proprietorship", description: "Groceries in Osu", address: "1 Oxford St", city: "Accra",
    region: "Greater Accra", country: "Ghana", phone: "0241234567", email: `alpha-${RUN}@example.test`, repName: "Owner alpha", repPosition: "Owner",
    repPhone: "0241234567", repEmail: `alpha-${RUN}@example.test`, categories: ["Groceries"], productCount: "1–20", fulfilment: "Collection from shop, delivery in Accra",
    offersCollection: true, offersDelivery: true,
  };
  const save = await A.patch(`/api/seller/applications/${appId}`, { data: answers });
  check("A: save draft answers", save.status === 200, save.data);
  const badDoc = await A.post(`/api/seller/applications/${appId}/documents`, (() => { const fd = file(Buffer.from("not a pdf at all"), "fake.pdf", "application/pdf"); fd.append("docKey", "registration"); return fd; })());
  check("A: document with wrong content type is rejected (magic bytes)", badDoc.status === 400, badDoc.data);
  const doc = await A.post(`/api/seller/applications/${appId}/documents`, (() => { const fd = file(PDF, "registration.pdf", "application/pdf"); fd.append("docKey", "registration"); return fd; })());
  check("A: upload PDF document", doc.status === 201, doc.data);
  const dl = await A.get(`/api/seller/applications/${appId}/documents/${doc.data?.document?.id}`);
  check("A: owner can download own document (private, no-store)", dl.status === 200 && /no-store/.test(dl.headers.get("cache-control") ?? ""), dl.status);
  const otherDl = await B.get(`/api/seller/applications/${appId}/documents/${doc.data?.document?.id}`);
  check("B: cannot download A's document", otherDl.status === 404, otherDl.status);
  const sub = await A.post(`/api/seller/applications/${appId}/submit`, {});
  check("A: submit application", sub.status === 200 && sub.data?.application?.status === "SUBMITTED", sub.data);
  const sub2 = await A.post(`/api/seller/applications/${appId}/submit`, {});
  check("A: cannot submit twice", sub2.status === 409, sub2.data);
  const editLocked = await A.patch(`/api/seller/applications/${appId}`, { data: { city: "Kumasi" } });
  check("A: submitted application cannot be edited", editLocked.status === 409, editLocked.data);

  // ---- Stage 2/10: admin review ------------------------------------------------------
  const admin = await adminLogin();
  const pend = await admin.get("/api/admin/store/applications?status=PENDING");
  check("admin: application appears in review queue", (pend.data?.applications ?? []).some((a) => a.id === appId), pend.data);
  const an = await admin.get("/api/admin/notifications");
  check("admin: platform notification for new application", (an.data?.items ?? []).some((n) => n.link === `/admin/store/applications/${appId}`), an.data);
  const adminDoc = await admin.get(`/api/admin/store/applications/${appId}/documents/${doc.data?.document?.id}`);
  check("admin: can open application document", adminDoc.status === 200, adminDoc.status);
  const noReason = await admin.post(`/api/admin/store/applications/${appId}/action`, { action: "request_info" });
  check("admin: request info requires a message", noReason.status === 400, noReason.data);
  const info = await admin.post(`/api/admin/store/applications/${appId}/action`, { action: "request_info", message: "Please confirm your shop opening hours." });
  check("admin: request more information", info.status === 200 && info.data?.status === "INFO_REQUIRED", info.data);
  await admin.post(`/api/admin/store/applications/${appId}/action`, { action: "note", message: "internal: checked registry" });
  const st1 = await A.get("/api/seller/status");
  check("A: sees info request, not the internal note", st1.data?.application?.status === "INFO_REQUIRED" && /opening hours/.test(st1.data?.application?.infoRequest ?? "") && !(st1.data?.application?.events ?? []).some((e) => /internal/.test(e.note ?? "")), st1.data?.application);
  const resub = await A.post(`/api/seller/applications/${appId}/submit`, { response: "Mon–Sat 8am–6pm" });
  check("A: resubmit after info request", resub.status === 200 && resub.data?.application?.status === "SUBMITTED", resub.data);
  const rev = await admin.post(`/api/admin/store/applications/${appId}/action`, { action: "start_review" });
  check("admin: start review", rev.data?.status === "UNDER_REVIEW", rev.data);
  const appr = await admin.post(`/api/admin/store/applications/${appId}/action`, { action: "approve" });
  check("admin: approve creates seller and applies pending package", appr.status === 200 && appr.data?.sellerId && appr.data?.packageApplied === "STORE_INVENTORY", appr.data);
  const m2 = await A.get("/api/business/mode");
  check("A: package now Store and Inventory, nothing pending", m2.data?.mode === "STORE_INVENTORY" && !m2.data?.pendingMode, m2.data);
  const pos = await A.post("/api/sales", { branchId: A.branchId, paymentMethod: "CASH", items: [{ productId: pA, quantity: 1, unitPrice: 72 }], clientTxnId: `e2e-${RUN}` });
  check("A: POS blocked in Store and Inventory (server-side)", pos.status === 403 && pos.data?.code === "MODULE_DISABLED", pos.data);
  const nA = await A.get("/api/notifications");
  check("A: notified of submission, info request and approval", (nA.data?.items ?? []).filter((n) => n.type === "STORE_APPLICATION").length >= 3 && nA.data.unread >= 3, nA.data?.items?.map((n) => n.title));
  const readOne = await A.post("/api/notifications/read", { ids: [nA.data.items[0].id] });
  check("A: mark one read lowers unread by one", readOne.data?.unread === nA.data.unread - 1, readOne.data);
  const readAll = await A.post("/api/notifications/read", { all: true });
  check("A: mark all read", readAll.data?.unread === 0, readAll.data);
  const crossRead = await B.post("/api/notifications/read", { ids: [nA.data.items[1].id] });
  check("B: cannot mark A's notification read", crossRead.data?.updated === 0, crossRead.data);

  // ---- B: apply from Settings while on Full, admin approves ---------------------------
  const bApp = await B.post("/api/seller/applications", {});
  check("B: start application from Settings", bApp.status === 201, bApp.data);
  await B.patch(`/api/seller/applications/${bApp.data.application.id}`, { data: { ...answers, registeredName: `E2E beta ${RUN}`, email: `beta-${RUN}@example.test`, repEmail: `beta-${RUN}@example.test`, offersDelivery: false } });
  await B.post(`/api/seller/applications/${bApp.data.application.id}/submit`, {});
  const bAppr = await admin.post(`/api/admin/store/applications/${bApp.data.application.id}/action`, { action: "approve" });
  check("admin: approve B (package stays Full)", bAppr.status === 200 && !bAppr.data?.packageApplied, bAppr.data);

  // ---- Stage 3/4: profile and listings --------------------------------------------------
  const badWa = await A.patch("/api/seller/profile", { whatsappNumber: "12" });
  check("A: invalid WhatsApp number rejected", badWa.status === 400, badWa.data);
  const prof = await A.patch("/api/seller/profile", { whatsappNumber: "024 123 4567", offersDelivery: true, offersCollection: true, collectionInfo: "Osu shop" });
  check("A: WhatsApp normalised to 233…", prof.data?.seller?.whatsappNumber === "233241234567", prof.data);
  await B.patch("/api/seller/profile", { whatsappNumber: "+233 20 000 0000" });
  const cats = await A.get("/api/store/public/categories");
  const catId = cats.data?.categories?.[0]?.id;
  check("public categories available", !!catId, cats.data);

  const lA = await A.post("/api/seller/listings", { productId: pA });
  check("A: list an inventory product (draft)", lA.status === 201 && lA.data?.listing?.status === "DRAFT", lA.data);
  const dup = await A.post("/api/seller/listings", { productId: pA });
  check("A: one listing per product", dup.status === 409, dup.data);
  const foreign = await A.post("/api/seller/listings", { productId: pB });
  check("A: cannot list B's product", foreign.status === 404, foreign.data);
  const listingA = lA.data.listing.id;
  const noPhoto = await A.post(`/api/seller/listings/${listingA}/action`, { action: "submit" });
  check("A: submit requires a photo", noPhoto.status === 400, noPhoto.data);
  const badImg = await A.post(`/api/seller/listings/${listingA}/images`, file(PDF, "x.png", "image/png"));
  check("A: non-image upload rejected", badImg.status === 400, badImg.data);
  const img = await A.post(`/api/seller/listings/${listingA}/images`, file(PNG, "rice.png", "image/png"));
  check("A: upload product photo", img.status === 201, img.data);
  await A.patch(`/api/seller/listings/${listingA}`, { categoryId: catId, description: "Fragrant rice" });
  const subL = await A.post(`/api/seller/listings/${listingA}/action`, { action: "submit" });
  check("A: submit listing for review", subL.data?.status === "SUBMITTED", subL.data);
  const pub0 = await new Client("guest0").get(`/api/store/public/catalog?seller=`);
  check("unapproved listing not public", !(pub0.data?.items ?? []).some((i) => i.id === listingA), pub0.data?.items?.length);
  const editDuringReview = await A.patch(`/api/seller/listings/${listingA}`, { title: "Changed" });
  check("A: cannot edit content during review", editDuringReview.status === 409, editDuringReview.data);
  const apL = await admin.post(`/api/admin/store/listings/${listingA}/action`, { action: "approve" });
  check("admin: approve publishes listing", apL.data?.status === "PUBLISHED", apL.data);

  const lB = await B.post("/api/seller/listings", { productId: pB, price: 85, categoryId: catId });
  await B.post(`/api/seller/listings/${lB.data.listing.id}/images`, file(PNG, "kente.png", "image/png"));
  await B.post(`/api/seller/listings/${lB.data.listing.id}/action`, { action: "submit" });
  const rej = await admin.post(`/api/admin/store/listings/${lB.data.listing.id}/action`, { action: "reject", reason: "Photo too small" });
  check("admin: reject listing with reason", rej.data?.status === "REJECTED", rej.data);
  await B.post(`/api/seller/listings/${lB.data.listing.id}/action`, { action: "submit" });
  await admin.post(`/api/admin/store/listings/${lB.data.listing.id}/action`, { action: "approve" });
  const listingB = lB.data.listing.id;

  // ---- Stage 5: public marketplace -------------------------------------------------------
  const guest = new Client("guest");
  const cat = await guest.get(`/api/store/public/catalog?q=E2E`);
  const itemA = (cat.data?.items ?? []).find((i) => i.id === listingA);
  const itemB = (cat.data?.items ?? []).find((i) => i.id === listingB);
  check("guest: both listings in catalog", !!itemA && !!itemB, cat.data?.items?.map((i) => i.title));
  check("catalog: B uses store price, A falls back to inventory price", itemB?.price === 85 && itemA?.price === 72, { a: itemA?.price, b: itemB?.price });
  check("catalog: availability comes from inventory (A=3)", itemA?.available === 3, itemA);
  check("catalog: no cost price or internal ids leaked", !JSON.stringify(cat.data).includes("costPrice") && !JSON.stringify(cat.data).includes(pA), null);
  const page = await guest.get(`/store/p/${listingA}`);
  check("product page renders with Open Graph tags", page.status === 200 && /og:title/.test(page.data) && /E2E Rice 5kg/.test(page.data), page.status);
  const sellerPage = await guest.get(`/store/s/${itemA?.seller?.slug}`);
  check("seller page renders", sellerPage.status === 200 && /E2E alpha/.test(sellerPage.data), sellerPage.status);
  const home = await guest.get(`/store`);
  check("marketplace home renders for guests (no login redirect)", home.status === 200, home.status);
  const imgPub = await guest.get(`/api/store/public/images/${img.data?.image?.id}`);
  check("public image served for published listing", imgPub.status === 200, imgPub.status);

  // ---- Stage 9: attribution visit ------------------------------------------------------
  const visit = await guest.post("/api/store/public/attribution", { channel: "whatsapp", event: "VISIT", targetType: "listing", targetId: listingA });
  check("visit via shared WhatsApp link recorded", visit.status === 200, visit.data);
  const badCh = await guest.post("/api/store/public/attribution", { channel: "myspace", event: "SHARE", targetType: "listing", targetId: listingA });
  check("unknown share channel rejected", badCh.status === 400, badCh.data);

  // ---- Stage 6: cart ----------------------------------------------------------------------
  const tooMany = await guest.post("/api/store/public/cart", { listingId: listingA, quantity: 4 });
  check("cart: cannot add more than available", tooMany.status === 409, tooMany.data);
  await guest.post("/api/store/public/cart", { listingId: listingA, quantity: 2 });
  const c2 = await guest.post("/api/store/public/cart", { listingId: listingB, quantity: 1 });
  check("cart holds items from two sellers", c2.data?.count === 3 && new Set(c2.data.lines.map((l) => l.seller.businessId)).size === 2, c2.data);
  const key = `e2e-${RUN}-checkout-0001`;
  const noF = await guest.post("/api/store/public/checkout", { idempotencyKey: key, customerName: "Ama Mensah", customerPhone: "0244000000", fulfilment: {} });
  check("checkout: fulfilment choice required per seller", noF.status === 400, noF.data);
  const sellers = [...new Set(c2.data.lines.map((l) => l.seller.businessId))];
  const bId = c2.data.lines.find((l) => l.listingId === listingB).seller.businessId;
  const aId = c2.data.lines.find((l) => l.listingId === listingA).seller.businessId;
  const noDel = await guest.post("/api/store/public/checkout", { idempotencyKey: key, customerName: "Ama Mensah", customerPhone: "0244000000", fulfilment: { [aId]: "COLLECTION", [bId]: "DELIVERY" }, deliveryAddress: "Osu" });
  check("checkout: refuses delivery from a seller who doesn't deliver", noDel.status === 400 && /delivery/i.test(noDel.data?.error ?? ""), noDel.data);
  const co = await guest.post("/api/store/public/checkout", { idempotencyKey: key, customerName: "Ama Mensah", customerPhone: "0244000000", fulfilment: { [aId]: "COLLECTION", [bId]: "COLLECTION" } });
  check("checkout: one order per seller", co.status === 201 && co.data?.orders?.length === 2 && sellers.length === 2, co.data);
  const retry = await guest.post("/api/store/public/checkout", { idempotencyKey: key, customerName: "Ama Mensah", customerPhone: "0244000000", fulfilment: { [aId]: "COLLECTION", [bId]: "COLLECTION" } });
  check("checkout: retry with same key returns the same orders (idempotent)", retry.status === 200 && JSON.stringify(retry.data.orders.map((o) => o.reference).sort()) === JSON.stringify(co.data.orders.map((o) => o.reference).sort()), retry.data);
  const emptied = await guest.get("/api/store/public/cart");
  check("cart emptied after checkout", emptied.data?.count === 0, emptied.data);
  const oA = co.data.orders.find((o) => o.sellerName.includes("alpha"));
  check("WhatsApp link targets seller number with prefilled message", /^https:\/\/wa\.me\/233241234567\?text=/.test(oA?.whatsappUrl ?? "") && decodeURIComponent(oA.whatsappUrl).includes(oA.reference), oA?.whatsappUrl);
  const stockAfterCheckout = await stockOf(A, pA);
  check("NEW order holds no stock (still 3)", stockAfterCheckout === 3, stockAfterCheckout);

  // ---- Stage 7: customer status and WhatsApp tap ---------------------------------------------
  const token = new URLSearchParams(oA.statusPath.split("?")[1]).get("t");
  const look = await guest.get(`/api/store/public/orders/${oA.reference}?t=${token}`);
  check("customer can view order with token", look.status === 200 && look.data?.order?.status === "NEW", look.data);
  const lookBad = await guest.get(`/api/store/public/orders/${oA.reference}?t=wrongtoken`);
  check("order lookup without the right token is not found", lookBad.status === 404, lookBad.status);
  const tap = await guest.post(`/api/store/public/orders/${oA.reference}/whatsapp?t=${token}`);
  check("WhatsApp tap recorded", tap.status === 200, tap.data);
  const look2 = await guest.get(`/api/store/public/orders/${oA.reference}?t=${token}`);
  check("status page records link opened, still NEW (not assumed sent/accepted)", !!look2.data?.order?.whatsappOpenedAt && look2.data.order.status === "NEW", look2.data?.order);

  // ---- Stage 8: seller order management ---------------------------------------------------------
  const nOrders = await A.get("/api/notifications");
  check("A: notified of the new order", (nOrders.data?.items ?? []).some((n) => n.type === "STORE_ORDER" && n.title.includes(oA.reference)), nOrders.data?.items?.map((n) => n.title));
  const ordersA = await A.get("/api/seller/orders?status=NEW");
  const orderA = (ordersA.data?.orders ?? []).find((o) => o.reference === oA.reference);
  check("A: order listed with attribution channel", orderA?.attributionChannel === "whatsapp", orderA);
  const crossOrder = await B.get(`/api/seller/orders/${orderA?.id}`);
  check("B: cannot see A's order", crossOrder.status === 404, crossOrder.status);
  const crossAct = await B.post(`/api/seller/orders/${orderA?.id}/action`, { action: "confirm" });
  check("B: cannot act on A's order", crossAct.status === 404, crossAct.data);
  const skip = await A.post(`/api/seller/orders/${orderA.id}/action`, { action: "complete" });
  check("A: invalid transition NEW → COMPLETED refused", skip.status === 409, skip.data);

  // second guest order for the same product: 2 + 2 > 3 in stock
  const g2 = new Client("guest2");
  await g2.post("/api/store/public/cart", { listingId: listingA, quantity: 2 });
  const co2 = await g2.post("/api/store/public/checkout", { idempotencyKey: `e2e-${RUN}-checkout-0002`, customerName: "Kofi", customerPhone: "0200000000", fulfilment: { [aId]: "COLLECTION" } });
  check("second customer can request while stock is not yet held", co2.status === 201, co2.data);
  const order2 = (await A.get("/api/seller/orders?status=NEW")).data.orders.find((o) => o.reference === co2.data.orders[0].reference);

  const [r1, r2] = await Promise.all([
    A.post(`/api/seller/orders/${orderA.id}/action`, { action: "confirm" }),
    A.post(`/api/seller/orders/${order2.id}/action`, { action: "confirm" }),
  ]);
  const okCount = [r1, r2].filter((r) => r.status === 200).length;
  check("concurrent confirmations: exactly one succeeds, no overselling", okCount === 1 && [r1, r2].some((r) => r.status === 409 && /stock/i.test(r.data?.error ?? "")), [r1.data, r2.data]);
  const stock1 = await stockOf(A, pA);
  check("stock deducted once on confirmation (3 → 1)", stock1 === 1, stock1);
  const confirmed = r1.status === 200 ? orderA : order2;
  const loser = r1.status === 200 ? order2 : orderA;
  const rejNoReason = await A.post(`/api/seller/orders/${loser.id}/action`, { action: "reject" });
  check("reject requires a reason", rejNoReason.status === 400, rejNoReason.data);
  const rejOk = await A.post(`/api/seller/orders/${loser.id}/action`, { action: "reject", note: "Only 1 left in stock" });
  check("reject with reason", rejOk.data?.status === "REJECTED", rejOk.data);
  const lowN = await A.get("/api/notifications");
  check("low-stock notification after confirmation", (lowN.data?.items ?? []).some((n) => n.type === "LOW_STOCK" || n.type === "OUT_OF_STOCK"), lowN.data?.items?.map((n) => n.type));
  const compNoPay = await A.post(`/api/seller/orders/${confirmed.id}/action`, { action: "ready" });
  check("ready for collection", compNoPay.data?.status === "READY_FOR_COLLECTION", compNoPay.data);
  const comp1 = await A.post(`/api/seller/orders/${confirmed.id}/action`, { action: "complete" });
  check("cannot complete before payment is recorded", comp1.status === 409 && /payment/i.test(comp1.data?.error ?? ""), comp1.data);
  const pay = await A.post(`/api/seller/orders/${confirmed.id}/action`, { action: "record_payment", note: "MoMo ref 123" });
  check("record payment", pay.data?.paymentStatus === "PAID", pay.data);
  const pay2 = await A.post(`/api/seller/orders/${confirmed.id}/action`, { action: "record_payment" });
  check("payment cannot be recorded twice", pay2.status === 409, pay2.data);
  const comp2 = await A.post(`/api/seller/orders/${confirmed.id}/action`, { action: "complete" });
  check("complete paid order", comp2.data?.status === "COMPLETED", comp2.data);

  // Cancel after confirmation returns stock
  const g3 = new Client("guest3");
  await g3.post("/api/store/public/cart", { listingId: listingA, quantity: 1 });
  const co3 = await g3.post("/api/store/public/checkout", { idempotencyKey: `e2e-${RUN}-checkout-0003`, customerName: "Esi", customerPhone: "0270000000", fulfilment: { [aId]: "COLLECTION" } });
  const order3 = (await A.get("/api/seller/orders?status=NEW")).data.orders.find((o) => o.reference === co3.data.orders[0].reference);
  await A.post(`/api/seller/orders/${order3.id}/action`, { action: "confirm" });
  check("confirm takes last unit (1 → 0)", (await stockOf(A, pA)) === 0, null);
  const outCat = await guest.get(`/api/store/public/catalog?q=E2E`);
  check("catalog shows out of stock", (outCat.data.items.find((i) => i.id === listingA) ?? {}).available === 0, null);
  const can = await A.post(`/api/seller/orders/${order3.id}/action`, { action: "cancel", note: "Customer changed mind" });
  check("cancel confirmed order", can.data?.status === "CANCELLED", can.data);
  check("cancellation returns stock (0 → 1)", (await stockOf(A, pA)) === 1, null);
  const can2 = await A.post(`/api/seller/orders/${order3.id}/action`, { action: "cancel", note: "again" });
  check("cannot cancel twice (no double restore)", can2.status === 409 && (await stockOf(A, pA)) === 1, can2.data);
  const cust = await g3.get(co3.data.orders[0].statusPath.replace("/store/orders/", "/api/store/public/orders/"));
  check("customer sees cancellation reason", cust.data?.order?.status === "CANCELLED" && cust.data.order.timeline.some((e) => e.note === "Customer changed mind"), cust.data?.order?.timeline);

  // ---- Stage 10: suspension and package changes hide listings ------------------------------------
  const sellersList = await admin.get("/api/admin/store/sellers");
  const sellerA = sellersList.data.sellers.find((s) => s.business.name.includes(`alpha ${RUN}`));
  const sus = await admin.patch(`/api/admin/store/sellers/${sellerA.id}`, { action: "suspend", reason: "E2E suspension check" });
  check("admin: suspend seller", sus.data?.seller?.status === "SUSPENDED", sus.data);
  const hidden = await guest.get(`/api/store/public/catalog?q=E2E`);
  check("suspended seller's listing disappears", !hidden.data.items.some((i) => i.id === listingA), null);
  const blockedEdit = await A.patch(`/api/seller/listings/${listingA}`, { isVisible: false });
  check("suspended seller cannot change listings", blockedEdit.status === 403, blockedEdit.data);
  await admin.patch(`/api/admin/store/sellers/${sellerA.id}`, { action: "reinstate", reason: "E2E reinstate check" });
  const back = await guest.get(`/api/store/public/catalog?q=E2E`);
  check("reinstated seller's listing returns", back.data.items.some((i) => i.id === listingA), null);
  const toInv = await A.put("/api/business/mode", { mode: "INVENTORY_ONLY", confirm: true });
  check("switch to Inventory Only warns listings are hidden", toInv.data?.mode === "INVENTORY_ONLY" && /hidden/.test(toInv.data?.note ?? ""), toInv.data);
  const hidden2 = await guest.get(`/api/store/public/catalog?q=E2E`);
  check("Inventory Only package hides listings", !hidden2.data.items.some((i) => i.id === listingA), null);
  const toStore = await A.put("/api/business/mode", { mode: "STORE_INVENTORY", confirm: true });
  check("approved seller switches back to Store and Inventory immediately", toStore.data?.mode === "STORE_INVENTORY" && !toStore.data?.pending, toStore.data);

  // Content edit of a live listing returns it to draft
  const ed = await A.patch(`/api/seller/listings/${listingA}`, { price: 75 });
  check("editing price of live listing sends it back for review", ed.data?.requiresReview === true && ed.data?.listing?.status === "DRAFT", ed.data);
  const vis = await A.patch(`/api/seller/listings/${listingB}`, { isVisible: false });
  check("B: listing not editable by A (and visibility toggle stays live)", vis.status === 404, vis.status);

  // Non-owner cannot change package
  // (registration creates only an owner; RBAC for MANAGER/CASHIER is enforced by requirePermission)

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error("ERROR", e); process.exit(2); });
