import { prisma } from "@/lib/prisma";
import { businessEmailPref, businessRecipients, type EmailPrefKey } from "./preferences";
import { sendAdminNotification, sendBusinessEmail, sendMarketplaceEmail } from "./service";

// High-level email triggers used by existing workflows. Each one is best effort:
// it checks the business preference, dedupes, and never throws into the caller.

const day = () => new Date().toISOString().slice(0, 10);

async function toTeam(businessId: string, pref: EmailPrefKey, build: (r: { id: string; email: string }) => Promise<unknown>) {
  try {
    if (!(await businessEmailPref(businessId, pref))) return;
    for (const r of await businessRecipients(businessId)) await build(r);
  } catch {
    /* email must never break the business action */
  }
}

export async function emailStockAlert(businessId: string, productId: string, kind: "low" | "out", d: { name: string; qty: number; min: number }) {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }).catch(() => null);
  // At most one email per product, state and person per day, so a product that keeps selling while low does not flood inboxes.
  await toTeam(businessId, "lowStock", (r) =>
    sendBusinessEmail(kind === "low" ? "low_stock" : "out_of_stock", r.email, { businessName: biz?.name ?? "your business", productName: d.name, quantity: d.qty, minimum: d.min }, `stock:${kind}:${productId}:${r.id}:${day()}`, businessId),
  );
}

export async function emailPurchaseOrder(businessId: string, purchaseId: string, d: { supplier: string; total: string; currency?: string }) {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, currency: true } }).catch(() => null);
  await toTeam(businessId, "purchaseOrders", (r) =>
    sendBusinessEmail("purchase_order", r.email, { businessName: biz?.name ?? "your business", reference: purchaseId.slice(0, 8).toUpperCase(), supplier: d.supplier, total: d.total, currency: d.currency ?? biz?.currency }, `po:${purchaseId}:${r.id}`, businessId),
  );
}

export async function emailMarketplaceOrderRequest(businessId: string, order: { id: string; reference: string; items: number; total: number | string; currency: string }) {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }).catch(() => null);
  await toTeam(businessId, "marketplace", (r) =>
    sendMarketplaceEmail("seller_new_order", r.email, { businessName: biz?.name ?? "your business", reference: order.reference, items: order.items, total: order.total, currency: order.currency }, `storeorder:${order.id}:${r.id}`, businessId),
  );
}

export async function emailSellerOrderStatus(businessId: string, order: { id: string; reference: string }, statusLabel: string, event: string) {
  await toTeam(businessId, "marketplace", (r) =>
    sendMarketplaceEmail("seller_order_status", r.email, { reference: order.reference, statusLabel }, `storeorderstatus:${order.id}:${event}:${r.id}`, businessId),
  );
}

/** Seller application mail goes to the business owner(s) and is essential: no preference can switch it off. */
export async function emailApplicationToOwners(businessId: string, template: "seller_application_submitted" | "seller_application_status", data: Record<string, unknown>, eventKey: string) {
  try {
    const owners = await prisma.user.findMany({ where: { businessId, isActive: true, role: "OWNER" }, select: { id: true, email: true } });
    for (const o of owners) await sendMarketplaceEmail(template, o.email, data, `${eventKey}:${o.id}`, businessId);
  } catch {
    /* best effort */
  }
}

export async function emailAdminNewApplication(applicationId: string, businessName: string, resubmission: boolean) {
  try {
    await sendAdminNotification("admin_new_application", { businessName: resubmission ? `${businessName} (updated)` : businessName }, `adminapp:${applicationId}:${resubmission ? "resub" : "new"}:${day()}`);
  } catch { /* best effort */ }
}

/** Daily summary for businesses that opted in. Yesterday in UTC (Ghana is UTC+0). Run by the cron route. */
export async function sendDailySalesSummaries(now = new Date()): Promise<{ businesses: number }> {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 86400_000);
  const period = start.toISOString().slice(0, 10);
  const candidates = await prisma.business.findMany({ where: { status: "ACTIVE", awaitingApproval: false }, select: { id: true, name: true, currency: true, settings: true } });
  let sent = 0;
  for (const b of candidates) {
    const raw = (b.settings as unknown as { emailNotifications?: { salesSummary?: boolean } } | null)?.emailNotifications;
    if (raw?.salesSummary !== true) continue;
    const agg = await prisma.sale.aggregate({ where: { businessId: b.id, status: "COMPLETED", createdAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { totalAmount: true } });
    if (agg._count._all === 0) continue;
    await toTeam(b.id, "salesSummary", (r) =>
      sendBusinessEmail("sales_summary", r.email, { businessName: b.name, period, count: agg._count._all, revenue: agg._sum.totalAmount?.toString() ?? "0", currency: b.currency }, `salessummary:${b.id}:${period}:${r.id}`, b.id),
    );
    sent++;
  }
  return { businesses: sent };
}
