import { prisma } from "@/lib/prisma";
import { hashToken } from "./cart";
import { expireStaleOrders } from "./server";
import { buildWhatsAppMessage, whatsAppLink, ORDER_STATUS_LABEL, type OrderStatus } from "./core";
import { timingSafeEqual } from "crypto";

const CUSTOMER_EVENTS = new Set(["PLACED", "CONFIRM", "REJECT", "AWAITING_PAYMENT", "PAYMENT_RECORDED", "PROCESSING", "READY", "DISPATCH", "COMPLETE", "CANCEL", "EXPIRED", "REFUND_RECORDED"]);
// Notes customers may see: why a seller rejected or cancelled.
const NOTE_VISIBLE = new Set(["REJECT", "CANCEL"]);

/**
 * Customer view of an order. Gated by the order's lookup token, or by being the
 * signed-in shopper the order was placed under.
 */
export async function customerOrder(reference: string, token: string | null, origin: string, shopperId: string | null = null) {
  if (token && token.length > 100) return null;
  if (!token && !shopperId) return null;
  const order = await prisma.storeOrder.findUnique({
    where: { reference: reference.toUpperCase() },
    include: {
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      business: { select: { name: true, storeSeller: { select: { slug: true, whatsappNumber: true, publicPhone: true, collectionInfo: true, deliveryInfo: true } } } },
    },
  });
  if (!order) return null;
  const owner = !!shopperId && order.shopperId === shopperId;
  if (!owner) {
    if (!token) return null;
    const a = Buffer.from(order.lookupTokenHash);
    const b = Buffer.from(hashToken(token));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  }
  if (order.status === "NEW" && order.expiresAt < new Date()) {
    await expireStaleOrders({ id: order.id });
    return customerOrder(reference, token, origin, shopperId);
  }
  const subtotal = Number(order.subtotal);
  const items = order.items.map((i) => ({ title: i.titleSnapshot, quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) }));
  const wa = order.business.storeSeller?.whatsappNumber ?? null;
  const message = buildWhatsAppMessage({
    reference: order.reference, sellerName: order.business.name, customerName: order.customerName, customerPhone: order.customerPhone, customerEmail: order.customerEmail,
    fulfilment: order.fulfilment, deliveryAddress: order.deliveryAddress, note: order.note, currency: order.currency, items, subtotal,
    statusUrl: origin ? `${origin}/store/orders/${order.reference}${token ? `?t=${token}` : ""}` : undefined,
  });
  return {
    reference: order.reference,
    status: order.status as OrderStatus,
    statusLabel: ORDER_STATUS_LABEL[order.status as OrderStatus],
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    subtotal,
    items,
    fulfilment: order.fulfilment,
    deliveryAddress: order.deliveryAddress,
    customerName: order.customerName,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    whatsappOpenedAt: order.whatsappOpenedAt,
    seller: {
      name: order.business.name, slug: order.business.storeSeller?.slug ?? null, phone: order.business.storeSeller?.publicPhone ?? null,
      collectionInfo: order.business.storeSeller?.collectionInfo ?? null, deliveryInfo: order.business.storeSeller?.deliveryInfo ?? null,
    },
    whatsappUrl: wa ? whatsAppLink(wa, message) : null,
    timeline: order.events
      .filter((e) => CUSTOMER_EVENTS.has(e.action))
      .map((e) => ({ action: e.action, toStatus: e.toStatus, at: e.createdAt, note: NOTE_VISIBLE.has(e.action) ? e.note : null })),
  };
}
