// Unit tests for Insight Store rules. Run:
//   npx esbuild tests/unit/store-core.test.ts --bundle --platform=node --outfile=/tmp/s.js && node /tmp/s.js
import assert from "node:assert/strict";
import {
  applicationTransition, missingApplicationFields, listingTransition, statusAfterContentEdit,
  canTransitionOrder, holdsStock, ORDER_TRANSITIONS, randomRef, slugify, splitBySeller,
  normalizeWhatsApp, buildWhatsAppMessage, whatsAppLink, sniffMime, safeFileName, cleanChannel,
} from "../../lib/store/core";

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.log("  FAIL " + name + "\n       " + (e as Error).message); process.exitCode = 1; }
};

console.log("Seller applications");
test("business can submit a draft", () => assert.equal(applicationTransition("submit", "DRAFT", "business"), "SUBMITTED"));
test("business can resubmit after info request", () => assert.equal(applicationTransition("submit", "INFO_REQUIRED", "business"), "SUBMITTED"));
test("business cannot approve itself", () => assert.equal(applicationTransition("approve", "SUBMITTED", "business"), null));
test("admin can approve submitted / under review", () => { assert.equal(applicationTransition("approve", "SUBMITTED", "admin"), "APPROVED"); assert.equal(applicationTransition("approve", "UNDER_REVIEW", "admin"), "APPROVED"); });
test("admin cannot approve a draft or a rejected application", () => { assert.equal(applicationTransition("approve", "DRAFT", "admin"), null); assert.equal(applicationTransition("approve", "REJECTED", "admin"), null); });
test("approved applications are final", () => { for (const a of ["submit", "withdraw", "reject", "request_info"]) { assert.equal(applicationTransition(a, "APPROVED", "admin"), null); assert.equal(applicationTransition(a, "APPROVED", "business"), null); } });
test("missing fields are reported", () => assert.ok(missingApplicationFields({ registeredName: "X", categories: [] }).includes("categories")));
test("complete application has no missing fields", () => assert.deepEqual(missingApplicationFields({ registeredName: "A", businessType: "Retail", description: "d", address: "a", city: "c", region: "r", country: "GH", phone: "1", email: "e@x.com", repName: "n", repPosition: "p", repPhone: "1", repEmail: "e@x.com", categories: ["x"], productCount: "10", fulfilment: "Delivery" }), []));

console.log("Listings");
test("seller submits a draft for review", () => assert.equal(listingTransition("submit", "DRAFT", "seller"), "SUBMITTED"));
test("seller cannot publish without approval", () => { assert.equal(listingTransition("republish", "DRAFT", "seller"), null); assert.equal(listingTransition("republish", "SUBMITTED", "seller"), null); assert.equal(listingTransition("approve", "SUBMITTED", "seller"), null); });
test("admin approval publishes", () => assert.equal(listingTransition("approve", "UNDER_REVIEW", "admin"), "PUBLISHED"));
test("rejected listing must be resubmitted, not republished", () => { assert.equal(listingTransition("republish", "REJECTED", "seller"), null); assert.equal(listingTransition("submit", "REJECTED", "seller"), "SUBMITTED"); });
test("unpublished approved listing can be republished without review", () => assert.equal(listingTransition("republish", "UNPUBLISHED", "seller"), "PUBLISHED"));
test("editing published content returns it to draft", () => { assert.equal(statusAfterContentEdit("PUBLISHED"), "DRAFT"); assert.equal(statusAfterContentEdit("UNPUBLISHED"), "DRAFT"); assert.equal(statusAfterContentEdit("SUBMITTED"), "SUBMITTED"); });

console.log("Orders");
test("new request can be confirmed or rejected", () => { assert.ok(canTransitionOrder("NEW", "CONFIRMED")); assert.ok(canTransitionOrder("NEW", "REJECTED")); });
test("cannot jump from new to completed or paid", () => { assert.equal(canTransitionOrder("NEW", "COMPLETED"), false); assert.equal(canTransitionOrder("NEW", "PAID"), false); });
test("terminal states have no exits", () => { for (const s of ["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"] as const) assert.deepEqual(ORDER_TRANSITIONS[s], []); });
test("dispatched orders cannot be cancelled", () => assert.equal(canTransitionOrder("DISPATCHED", "CANCELLED"), false));
test("only confirmed-and-later statuses hold stock", () => { assert.equal(holdsStock("NEW"), false); assert.equal(holdsStock("CONFIRMED"), true); assert.equal(holdsStock("CANCELLED"), false); assert.equal(holdsStock("EXPIRED"), false); });
test("every transition target is a known status", () => { const all = Object.keys(ORDER_TRANSITIONS); for (const t of Object.values(ORDER_TRANSITIONS).flat()) assert.ok(all.includes(t)); });

console.log("Cart splitting (multi-seller)");
const L = (id: string, biz: string, price: number, qty: number) => ({ listingId: id, businessId: biz, sellerName: biz.toUpperCase(), title: id, unitPrice: price, quantity: qty });
test("single seller -> one order", () => assert.equal(splitBySeller([L("a", "s1", 10, 2)]).length, 1));
test("two sellers -> two orders", () => assert.equal(splitBySeller([L("a", "s1", 10, 1), L("b", "s2", 5, 1)]).length, 2));
test("three sellers -> three orders, each with only its own lines", () => {
  const g = splitBySeller([L("a", "s1", 10, 1), L("b", "s2", 5, 2), L("c", "s3", 7.5, 1), L("d", "s1", 1.1, 3)]);
  assert.equal(g.length, 3);
  const s1 = g.find((x) => x.businessId === "s1")!;
  assert.deepEqual(s1.lines.map((l) => l.listingId), ["a", "d"]);
  assert.equal(s1.subtotal, 13.3);
  assert.ok(g.every((x) => x.lines.every((l) => l.businessId === x.businessId)));
});
test("subtotals avoid floating point drift", () => assert.equal(splitBySeller([L("a", "s1", 0.1, 3), L("b", "s1", 0.2, 1)])[0].subtotal, 0.5));

console.log("WhatsApp");
test("Ghana local number -> international", () => assert.equal(normalizeWhatsApp("024 412 3456"), "233244123456"));
test("+ and 00 prefixes handled", () => { assert.equal(normalizeWhatsApp("+233 24 412 3456"), "233244123456"); assert.equal(normalizeWhatsApp("00233244123456"), "233244123456"); });
test("garbage rejected", () => { assert.equal(normalizeWhatsApp("abc"), null); assert.equal(normalizeWhatsApp(""), null); assert.equal(normalizeWhatsApp("12"), null); });
const msg = buildWhatsAppMessage({ reference: "ISO-ABCD1234", sellerName: "Ama's Shop", customerName: "Kofi & Sons", customerPhone: "0244", fulfilment: "DELIVERY", deliveryAddress: "12 Ring Rd, Accra #3", note: "Call first?", currency: "GHS", items: [{ title: "Rice 5kg", quantity: 2, unitPrice: 72, lineTotal: 144 }], subtotal: 144 });
test("message contains reference, items, subtotal, fulfilment", () => { for (const s of ["ISO-ABCD1234", "2 x Rice 5kg @ GHS 72.00 = GHS 144.00", "Subtotal: GHS 144.00", "Delivery to: 12 Ring Rd, Accra #3", "Note: Call first?"]) assert.ok(msg.includes(s), s); });
test("link is URL-encoded and round-trips exactly", () => { const link = whatsAppLink("233244123456", msg); assert.ok(link.startsWith("https://wa.me/233244123456?text=")); assert.ok(!/[ &#\n]/.test(link.split("?text=")[1])); assert.equal(decodeURIComponent(link.split("?text=")[1]), msg); });

console.log("Files and misc");
test("PDF / PNG / JPEG / WebP recognised by content", () => {
  assert.equal(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), "application/pdf");
  assert.equal(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "image/webp");
});
test("executables / HTML disguised as images are rejected", () => { assert.equal(sniffMime(new TextEncoder().encode("<html><script>")), null); assert.equal(sniffMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null); });
test("file names are sanitised", () => assert.equal(safeFileName("../../etc/passwd<script>.pdf"), ".._.._etc_passwd_script_.pdf"));
test("slugify", () => { assert.equal(slugify("Ama's Shop & Co."), "ama-s-shop-co"); assert.equal(slugify("Café Ölé"), "cafe-ole"); assert.equal(slugify("!!!"), "seller"); });
test("references use an unambiguous alphabet", () => { for (let i = 0; i < 200; i++) assert.match(randomRef("ISO"), /^ISO-[A-HJ-NP-Z2-9]{8}$/); });
test("share channels are whitelisted", () => { assert.equal(cleanChannel("WhatsApp"), "whatsapp"); assert.equal(cleanChannel("evil.com"), null); });

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
