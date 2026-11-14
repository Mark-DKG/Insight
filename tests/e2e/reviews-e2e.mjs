// End-to-end test of Insight Store reviews against a build backed by a
// DISPOSABLE database branch (never production).
//   BASE=https://preview [SHARE=token] ADMIN_EMAIL=e2e-... ADMIN_PASSWORD=... node tests/e2e/reviews-e2e.mjs
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
  const idDoc = file(PNG, "ghana-card.png", "image/png"); idDoc.append("docKey", "owner_id");
  await S.post(`/api/seller/applications/${appId}/documents`, idDoc);
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
  const slug = (await S.get("/api/seller/profile")).data?.profile?.slug ?? (await S.get("/api/seller/profile")).data?.seller?.slug;


  // ---- Guests --------------------------------------------------------------------------------
  console.log("\n# Guests can read but not write");
  const guest = await client("guest");
  const gr = await guest.get(`/api/store/public/reviews?listingId=${listing}`);
  check("guest can read reviews (empty)", gr.status === 200 && gr.data?.summary?.count === 0 && gr.data?.viewer?.signedIn === false, gr.data);
  const gp = await guest.post("/api/store/public/reviews", { listingId: listing, rating: 5, comment: "Nice rice" });
  check("guest cannot post a review", gp.status === 401 && gp.data?.code === "SIGN_IN", gp.data);
  check("guest cannot report", (await guest.post("/api/store/public/reviews/x/report", { reason: "spam spam" })).status === 401);
  check("guest cannot delete", (await guest.del("/api/store/public/reviews/x")).status === 401);
  check("unknown product is 404", (await guest.get("/api/store/public/reviews?listingId=nope")).status === 404);
  check("no target is 404", (await guest.get("/api/store/public/reviews")).status === 404);

  // ---- Eligibility -----------------------------------------------------------------------------
  console.log("\n# Only shoppers with a completed order can review");
  const A = await client("shopperA");
  const emailA = `kofi-${RUN}@example.com`;
  await A.post("/api/store/public/account/register", { name: "Kofi Boateng", email: emailA, password: PW });
  const noOrder = await A.get(`/api/store/public/reviews?listingId=${listing}`);
  check("signed-in shopper without an order sees why they can't review", noOrder.data?.viewer?.signedIn === true && noOrder.data?.viewer?.canReview === false && /completed/.test(noOrder.data?.viewer?.reason ?? ""), noOrder.data?.viewer);
  check("no order: product review refused", (await A.post("/api/store/public/reviews", { listingId: listing, rating: 5 })).status === 403);
  check("no order: store review refused", (await A.post("/api/store/public/reviews", { seller: slug, rating: 5 })).status === 403);

  const add = await A.post("/api/store/public/cart", { listingId: listing, quantity: 1 });
  const sellerBiz = add.data?.lines?.[0]?.seller?.businessId;
  const co = await A.post("/api/store/public/checkout", { idempotencyKey: `e2e-${RUN}-rv-1`, customerName: "Kofi Boateng", customerPhone: "0244000000", fulfilment: { [sellerBiz]: "COLLECTION" } });
  check("shopper placed an order", co.status === 201, co.data);
  const ref = co.data?.orders?.[0]?.reference;
  check("NEW order does not unlock reviews", (await A.post("/api/store/public/reviews", { listingId: listing, rating: 5 })).status === 403);
  const list = await S.get("/api/seller/orders?status=");
  const orderId = (list.data?.orders ?? []).find((o) => o.reference === ref)?.id;
  check("seller sees the order", !!orderId, list.data?.orders?.length);
  for (const action of ["confirm", "ready"]) {
    const r = await S.post(`/api/seller/orders/${orderId}/action`, { action });
    check(`seller ${action}`, r.status === 200, r.data);
  }
  check("READY order still does not unlock reviews", (await A.post("/api/store/public/reviews", { listingId: listing, rating: 5 })).status === 403);

  // a guest buyer completing an order grants nobody anything
  const GB = await client("guestbuyer");
  await GB.post("/api/store/public/cart", { listingId: listing, quantity: 1 });
  const gco = await GB.post("/api/store/public/checkout", { idempotencyKey: `e2e-${RUN}-rv-guest`, customerName: "Guest", customerPhone: "0555000000", fulfilment: { [sellerBiz]: "COLLECTION" } });
  check("guest order placed", gco.status === 201, gco.data);

  const done = await S.post(`/api/seller/orders/${orderId}/action`, { action: "complete" });
  check("seller completes the order", done.status === 200 && done.data?.status === "COMPLETED", done.data);
  const elig = await A.get(`/api/store/public/reviews?listingId=${listing}`);
  check("completed order unlocks reviewing", elig.data?.viewer?.canReview === true, elig.data?.viewer);

  const B = await client("shopperB");
  await B.post("/api/store/public/account/register", { name: "Yaa Asantewaa", email: `yaa-${RUN}@example.com`, password: PW });
  check("another shopper's completed order does not unlock reviews for me", (await B.post("/api/store/public/reviews", { listingId: listing, rating: 5 })).status === 403);

  // ---- Posting ----------------------------------------------------------------------------------------
  console.log("\n# Posting and validation");
  for (const [label, body] of [
    ["rating 0", { listingId: listing, rating: 0 }], ["rating 6", { listingId: listing, rating: 6 }], ["rating 3.5", { listingId: listing, rating: 3.5 }],
    ["text rating", { listingId: listing, rating: "great" }], ["no rating", { listingId: listing }],
    ["links in comment", { listingId: listing, rating: 5, comment: "buy at http://spam.example" }],
    ["bare domain in comment", { listingId: listing, rating: 5, comment: "visit shop.com now" }],
    ["too-long comment", { listingId: listing, rating: 5, comment: "x".repeat(1001) }],
    ["both targets missing", { rating: 5 }],
  ]) {
    const r = await A.post("/api/store/public/reviews", body);
    check(`rejects ${label}`, r.status === 400 || r.status === 404, [r.status, r.data]);
  }
  const p1 = await A.post("/api/store/public/reviews", { listingId: listing, rating: 5, comment: "Great rice, cooked well." });
  check("product review created", p1.status === 201 && p1.data?.created === true, p1.data);
  const st1 = await A.post("/api/store/public/reviews", { seller: slug, rating: 4, comment: "Quick collection." });
  check("store review created", st1.status === 201, st1.data);
  const p1b = await A.post("/api/store/public/reviews", { listingId: listing, rating: 4, comment: "Edited: still good." });
  check("posting again edits instead of duplicating", p1b.status === 200 && p1b.data?.created === false && p1b.data?.review?.id === p1.data?.review?.id, p1b.data);

  const pubList = await guest.get(`/api/store/public/reviews?listingId=${listing}`);
  check("guests see exactly one product review", pubList.data?.summary?.count === 1 && pubList.data?.summary?.average === 4 && pubList.data?.reviews?.length === 1, pubList.data?.summary);
  const rv = pubList.data?.reviews?.[0];
  check("shows first name and initial only", rv?.displayName === "Kofi B.", rv);
  check("shows the edited text and the edited flag is absent for instant edits", rv?.comment === "Edited: still good.", rv);
  check("public review leaks no email, shopper or order ids", !/shopperId|orderId|email|dedupeKey|@example/.test(JSON.stringify(pubList.data)), pubList.data);
  const sp = await guest.get(`/api/store/public/reviews?seller=${slug}`);
  check("store summary is separate from product summary", sp.data?.summary?.count === 1 && sp.data?.summary?.average === 4, sp.data?.summary);
  const mineA = await A.get(`/api/store/public/reviews?listingId=${listing}`);
  check("viewer.mine returns the author's own review", mineA.data?.viewer?.mine?.rating === 4, mineA.data?.viewer);

  // ---- Catalog and pages -------------------------------------------------------------------------------
  console.log("\n# Ratings show up in the store");
  const cat = await guest.get("/api/store/public/catalog?sort=rating");
  const item = (cat.data?.items ?? []).find((i) => i.id === listing);
  check("catalog item carries rating", item?.rating?.average === 4 && item?.rating?.count === 1, item);
  check("sort=rating works", cat.status === 200, cat.status);
  const page = await guest.get(`/store/p/${listing}`);
  check("product page renders with stars", page.status === 200 && /Rated 4\.0 out of 5 from 1 review/.test(page.data), page.status);
  const spage = await guest.get(`/store/s/${slug}`);
  check("seller page renders with stars", spage.status === 200 && /Rated 4\.0 out of 5 from 1 review/.test(spage.data), spage.status);
  check("search page renders", (await guest.get("/store/search?sort=rating")).status === 200);

  // ---- Seller side ----------------------------------------------------------------------------------------
  console.log("\n# Seller replies and reports");
  const sl = await S.get("/api/seller/reviews");
  check("seller lists both reviews", sl.status === 200 && sl.data?.reviews?.length === 2, sl.data);
  const prodReview = (sl.data?.reviews ?? []).find((r) => r.kind === "PRODUCT");
  check("seller list has no shopper contact details", !/@example|shopperId|email/.test(JSON.stringify(sl.data)), sl.data);
  check("link in reply rejected", (await S.post(`/api/seller/reviews/${prodReview.id}/reply`, { reply: "see http://x.example" })).status === 400);
  check("empty reply rejected", (await S.post(`/api/seller/reviews/${prodReview.id}/reply`, { reply: "  " })).status === 400);
  const rep = await S.post(`/api/seller/reviews/${prodReview.id}/reply`, { reply: "Thank you Kofi, come again!" });
  check("seller can reply", rep.status === 200, rep.data);
  const withReply = await guest.get(`/api/store/public/reviews?listingId=${listing}`);
  check("reply is public", withReply.data?.reviews?.[0]?.sellerReply === "Thank you Kofi, come again!", withReply.data?.reviews?.[0]);
  check("unanswered filter now shows only the store review", (await S.get("/api/seller/reviews?filter=unanswered")).data?.reviews?.length === 1);
  check("customer cannot use seller routes", [401, 403].includes((await A.post(`/api/seller/reviews/${prodReview.id}/reply`, { reply: "I reply to myself" })).status));
  check("reply can be removed", (await S.post(`/api/seller/reviews/${prodReview.id}/reply`, { reply: null })).status === 200 && !(await guest.get(`/api/store/public/reviews?listingId=${listing}`)).data?.reviews?.[0]?.sellerReply);
  const otherSeller = await client("seller2");
  const o2 = `e2e-seller2-${RUN}@example.com`;
  await otherSeller.post("/api/auth/register", { businessName: `E2E Other ${RUN}`, ownerName: "Other", email: o2, password: PW });
  await otherSeller.post("/api/auth/login", { email: o2, password: PW });
  check("another business cannot reply to this review", [403, 404].includes((await otherSeller.post(`/api/seller/reviews/${prodReview.id}/reply`, { reply: "Not mine to answer" })).status));
  check("report needs a reason", (await S.post(`/api/seller/reviews/${prodReview.id}/report`, { reason: "bad" })).status === 400);
  check("seller can report", (await S.post(`/api/seller/reviews/${prodReview.id}/report`, { reason: "This looks like a competitor." })).status === 200);
  check("seller report is idempotent", (await S.post(`/api/seller/reviews/${prodReview.id}/report`, { reason: "This looks like a competitor." })).status === 200);

  // ---- Shopper reports -----------------------------------------------------------------------------------------
  console.log("\n# Shopper reports");
  check("author cannot report own review", (await A.post(`/api/store/public/reviews/${prodReview.id}/report`, { reason: "my own review" })).status === 400);
  check("other shopper can report", (await B.post(`/api/store/public/reviews/${prodReview.id}/report`, { reason: "Sounds fake to me" })).status === 200);
  check("report needs a reason", (await B.post(`/api/store/public/reviews/${prodReview.id}/report`, { reason: "x" })).status === 400);

  // ---- Admin moderation ------------------------------------------------------------------------------------------
  console.log("\n# Admin moderation");
  check("anonymous cannot reach admin reviews", [401, 403].includes((await guest.get("/api/admin/store/reviews")).status));
  const rq = await admin.get("/api/admin/store/reviews?filter=reported");
  const queued = (rq.data?.reviews ?? []).find((r) => r.id === prodReview.id);
  check("reported review is in the queue with both reports", rq.status === 200 && queued?.openReports?.length === 2, rq.data);
  check("moderators don't see shopper email", !/@example\.com/.test(JSON.stringify(rq.data)), "leak");
  check("hide needs a reason", (await admin.post(`/api/admin/store/reviews/${prodReview.id}/action`, { action: "hide" })).status === 400);
  const hide = await admin.post(`/api/admin/store/reviews/${prodReview.id}/action`, { action: "hide", reason: "Not a genuine customer review." });
  check("admin hides the review", hide.status === 200, hide.data);
  const afterHide = await guest.get(`/api/store/public/reviews?listingId=${listing}`);
  check("hidden review disappears and stops counting", afterHide.data?.summary?.count === 0 && afterHide.data?.reviews?.length === 0, afterHide.data?.summary);
  const cat2 = await guest.get("/api/store/public/catalog");
  check("catalog rating goes away", !(cat2.data?.items ?? []).find((i) => i.id === listing)?.rating, cat2.data?.items?.[0]);
  const edit = await A.post("/api/store/public/reviews", { listingId: listing, rating: 5, comment: "Trying to edit it back" });
  check("author cannot edit a hidden review", edit.status === 409, edit.data);
  check("seller no longer sees hidden review", (await S.get("/api/seller/reviews")).data?.reviews?.every((r) => r.id !== prodReview.id));
  check("hidden review can't be reported", (await B.post(`/api/store/public/reviews/${prodReview.id}/report`, { reason: "Still sounds fake" })).status === 404);
  check("hide twice is a conflict", (await admin.post(`/api/admin/store/reviews/${prodReview.id}/action`, { action: "hide", reason: "Again please" })).status === 409);
  const hid = await admin.get("/api/admin/store/reviews?filter=hidden");
  check("hidden list shows it with the reason", (hid.data?.reviews ?? []).some((r) => r.id === prodReview.id && /genuine/.test(r.hiddenReason)), hid.data);
  const unhide = await admin.post(`/api/admin/store/reviews/${prodReview.id}/action`, { action: "unhide" });
  check("admin restores it", unhide.status === 200, unhide.data);
  check("restored review counts again", (await guest.get(`/api/store/public/reviews?listingId=${listing}`)).data?.summary?.count === 1);
  const dis = await admin.post(`/api/admin/store/reviews/${prodReview.id}/action`, { action: "dismiss_reports" });
  check("dismiss reports is accepted", dis.status === 200, dis.data);
  check("queue is empty after dismissal", (await admin.get("/api/admin/store/reviews?filter=reported")).data?.reviews?.length === 0);

  // ---- Deleting ------------------------------------------------------------------------------------------------------------
  console.log("\n# Deleting");
  check("another shopper cannot delete my review", (await B.del(`/api/store/public/reviews/${prodReview.id}`)).status === 404);
  const dl = await A.del(`/api/store/public/reviews/${prodReview.id}`);
  check("author deletes own review", dl.status === 200, dl.data);
  check("deleted review is gone from the public list", (await guest.get(`/api/store/public/reviews?listingId=${listing}`)).data?.summary?.count === 0);
  const re = await A.post("/api/store/public/reviews", { listingId: listing, rating: 5, comment: "Posting again after delete." });
  check("author can post again after deleting", re.status === 201, re.data);
  const del = await A.del("/api/store/public/account/profile", { password: PW });
  check("shopper deletes their account", del.status === 200, del.data);
  check("account deletion removes their reviews", (await guest.get(`/api/store/public/reviews?seller=${slug}`)).data?.summary?.count === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error("ERROR", e); process.exit(2); });
