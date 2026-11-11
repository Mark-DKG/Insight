// Pure Insight Store rules: status machines, references, WhatsApp messages,
// cart splitting, file checks. No database access, so they are unit-tested
// directly (tests/unit/store-core.test.ts).

// ---------------------------------------------------------------------------
// Seller applications
// ---------------------------------------------------------------------------
export type ApplicationStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "INFO_REQUIRED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export const OPEN_APPLICATION_STATUSES: ApplicationStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED"];

const APPLICATION_TRANSITIONS: Record<string, { from: ApplicationStatus[]; to: ApplicationStatus; by: "business" | "admin" }> = {
  submit: { from: ["DRAFT", "INFO_REQUIRED"], to: "SUBMITTED", by: "business" },
  withdraw: { from: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED"], to: "WITHDRAWN", by: "business" },
  start_review: { from: ["SUBMITTED"], to: "UNDER_REVIEW", by: "admin" },
  request_info: { from: ["SUBMITTED", "UNDER_REVIEW"], to: "INFO_REQUIRED", by: "admin" },
  approve: { from: ["SUBMITTED", "UNDER_REVIEW"], to: "APPROVED", by: "admin" },
  reject: { from: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED"], to: "REJECTED", by: "admin" },
};

export function applicationTransition(action: string, from: ApplicationStatus, by: "business" | "admin"): ApplicationStatus | null {
  const t = APPLICATION_TRANSITIONS[action];
  if (!t || t.by !== by || !t.from.includes(from)) return null;
  return t.to;
}

/** Fields a business must complete before an application can be submitted. */
export const REQUIRED_APPLICATION_FIELDS = [
  "registeredName", "businessType", "description", "address", "city", "region", "country", "phone", "email",
  "repName", "repPosition", "repPhone", "repEmail", "categories", "productCount", "fulfilment",
] as const;

export function missingApplicationFields(data: Record<string, unknown>): string[] {
  return REQUIRED_APPLICATION_FIELDS.filter((k) => {
    const v = data[k];
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || String(v).trim() === "";
  });
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
export type ListingStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "PUBLISHED" | "REJECTED" | "UNPUBLISHED";

const LISTING_TRANSITIONS: Record<string, { from: ListingStatus[]; to: ListingStatus; by: "seller" | "admin" }> = {
  submit: { from: ["DRAFT", "REJECTED"], to: "SUBMITTED", by: "seller" },
  unpublish: { from: ["PUBLISHED", "APPROVED"], to: "UNPUBLISHED", by: "seller" },
  // Republishing is allowed only for content that was approved and not edited since.
  republish: { from: ["UNPUBLISHED", "APPROVED"], to: "PUBLISHED", by: "seller" },
  start_review: { from: ["SUBMITTED"], to: "UNDER_REVIEW", by: "admin" },
  approve: { from: ["SUBMITTED", "UNDER_REVIEW"], to: "PUBLISHED", by: "admin" },
  reject: { from: ["SUBMITTED", "UNDER_REVIEW"], to: "REJECTED", by: "admin" },
  admin_unpublish: { from: ["PUBLISHED", "APPROVED"], to: "UNPUBLISHED", by: "admin" },
};

export function listingTransition(action: string, from: ListingStatus, by: "seller" | "admin"): ListingStatus | null {
  const t = LISTING_TRANSITIONS[action];
  if (!t || t.by !== by || !t.from.includes(from)) return null;
  return t.to;
}

/** Editing listing content after review sends it back for review. */
export function statusAfterContentEdit(current: ListingStatus): ListingStatus {
  return current === "SUBMITTED" || current === "UNDER_REVIEW" ? current : "DRAFT";
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export type OrderStatus =
  | "NEW" | "CONFIRMED" | "AWAITING_PAYMENT" | "PAID" | "PROCESSING" | "READY_FOR_COLLECTION"
  | "DISPATCHED" | "COMPLETED" | "REJECTED" | "CANCELLED" | "EXPIRED";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["AWAITING_PAYMENT", "PAID", "PROCESSING", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "COMPLETED", "CANCELLED"],
  PROCESSING: ["READY_FOR_COLLECTION", "DISPATCHED", "COMPLETED", "CANCELLED"],
  READY_FOR_COLLECTION: ["COMPLETED", "CANCELLED"],
  DISPATCHED: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "New request", CONFIRMED: "Confirmed", AWAITING_PAYMENT: "Awaiting payment", PAID: "Paid",
  PROCESSING: "Processing", READY_FOR_COLLECTION: "Ready for collection", DISPATCHED: "Dispatched",
  COMPLETED: "Completed", REJECTED: "Rejected", CANCELLED: "Cancelled", EXPIRED: "Expired",
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses in which stock has been taken from inventory for the order. */
export function holdsStock(status: OrderStatus): boolean {
  return ["CONFIRMED", "AWAITING_PAYMENT", "PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "COMPLETED"].includes(status);
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function randomRef(prefix: string, length = 8, rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  let s = "";
  for (let i = 0; i < length; i++) s += REF_ALPHABET[rand(REF_ALPHABET.length)];
  return `${prefix}-${s}`;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "seller";
}

// ---------------------------------------------------------------------------
// Cart splitting: one order request per seller
// ---------------------------------------------------------------------------
export interface CartLine {
  listingId: string;
  businessId: string;
  sellerName: string;
  title: string;
  unitPrice: number;
  quantity: number;
}

export interface SellerGroup {
  businessId: string;
  sellerName: string;
  lines: (CartLine & { lineTotal: number })[];
  subtotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function splitBySeller(lines: CartLine[]): SellerGroup[] {
  const groups = new Map<string, SellerGroup>();
  for (const line of lines) {
    const g = groups.get(line.businessId) ?? { businessId: line.businessId, sellerName: line.sellerName, lines: [], subtotal: 0 };
    const lineTotal = round2(line.unitPrice * line.quantity);
    g.lines.push({ ...line, lineTotal });
    g.subtotal = round2(g.subtotal + lineTotal);
    groups.set(line.businessId, g);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/** Normalises a phone number to digits in international format for wa.me. */
export function normalizeWhatsApp(raw: string | null | undefined, defaultCountryCode = "233"): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
  digits = digits.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export interface WhatsAppOrder {
  reference: string;
  sellerName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  fulfilment: "DELIVERY" | "COLLECTION";
  deliveryAddress?: string | null;
  note?: string | null;
  currency: string;
  items: { title: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  statusUrl?: string;
}

const money = (n: number, cur: string) => `${cur} ${n.toFixed(2)}`;

export function buildWhatsAppMessage(o: WhatsAppOrder): string {
  const lines = [
    `Hello ${o.sellerName}, I'd like to order from Insight Store.`,
    ``,
    `Order reference: ${o.reference}`,
    `Name: ${o.customerName}`,
    `Phone: ${o.customerPhone}`,
    ...(o.customerEmail ? [`Email: ${o.customerEmail}`] : []),
    ``,
    ...o.items.map((i) => `- ${i.quantity} x ${i.title} @ ${money(i.unitPrice, o.currency)} = ${money(i.lineTotal, o.currency)}`),
    ``,
    `Subtotal: ${money(o.subtotal, o.currency)}`,
    o.fulfilment === "DELIVERY" ? `Delivery to: ${o.deliveryAddress ?? "(address to be confirmed)"}` : `I will collect the order.`,
    ...(o.note ? [`Note: ${o.note}`] : []),
    ...(o.statusUrl ? [``, `Order status: ${o.statusUrl}`] : []),
    ``,
    `Please confirm availability and payment details.`,
  ];
  return lines.join("\n");
}

export function whatsAppLink(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

// ---------------------------------------------------------------------------
// Uploads: trust file contents (magic bytes), not the browser's MIME label.
// ---------------------------------------------------------------------------
export function sniffMime(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------
export const SHARE_CHANNELS = ["whatsapp", "facebook", "instagram", "tiktok", "x", "telegram", "copy", "native"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export function cleanChannel(input: string | null | undefined): ShareChannel | null {
  const v = String(input ?? "").toLowerCase();
  return (SHARE_CHANNELS as readonly string[]).includes(v) ? (v as ShareChannel) : null;
}
