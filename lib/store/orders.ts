import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canTransitionOrder, ORDER_STATUS_LABEL, type OrderStatus } from "./core";
import { fulfilmentBranchId } from "./server";

// Seller order actions. Stock is taken from inventory only when the seller
// confirms (a NEW request holds nothing), with a conditional decrement that
// cannot go below zero, and is put back if a confirmed order is cancelled.

export const ORDER_ACTIONS = {
  confirm: "CONFIRMED",
  reject: "REJECTED",
  awaiting_payment: "AWAITING_PAYMENT",
  processing: "PROCESSING",
  ready: "READY_FOR_COLLECTION",
  dispatch: "DISPATCHED",
  complete: "COMPLETED",
  cancel: "CANCELLED",
} as const satisfies Record<string, OrderStatus>;
export type OrderAction = keyof typeof ORDER_ACTIONS | "record_payment" | "record_refund";

export class OrderActionError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

interface Actor { type: "BUSINESS_USER" | "PLATFORM_ADMIN" | "SYSTEM"; id?: string | null; label: string; userId?: string | null }

export async function applyOrderAction(opts: { orderId: string; businessId: string; action: OrderAction; note?: string | null; actor: Actor }) {
  const { orderId, businessId, action, actor } = opts;
  const note = opts.note?.trim().slice(0, 1000) || null;

  return prisma.$transaction(async (tx) => {
    const order = await tx.storeOrder.findFirst({ where: { id: orderId, businessId }, include: { items: true } });
    if (!order) throw new OrderActionError("Order not found.", 404);
    const from = order.status as OrderStatus;
    const terminal = ["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(from);

    // --- payment records (no status machine move unless awaiting payment) ---
    if (action === "record_payment") {
      if (order.paymentStatus === "PAID") throw new OrderActionError("Payment is already recorded for this order.");
      if (from === "NEW" || terminal) throw new OrderActionError("Confirm the order before recording payment.");
      const to: OrderStatus = from === "CONFIRMED" || from === "AWAITING_PAYMENT" ? "PAID" : from;
      const u = await tx.storeOrder.updateMany({ where: { id: order.id, status: from, paymentStatus: order.paymentStatus }, data: { paymentStatus: "PAID", status: to } });
      if (u.count !== 1) throw new OrderActionError("The order changed while you were working. Refresh and try again.");
      await tx.storeOrderEvent.create({ data: { orderId: order.id, actorType: actor.type, actorId: actor.id ?? null, actorLabel: actor.label, action: "PAYMENT_RECORDED", fromStatus: from, toStatus: to, note } });
      return { status: to, paymentStatus: "PAID" as const };
    }
    if (action === "record_refund") {
      if (order.paymentStatus !== "PAID") throw new OrderActionError("Only a paid order can be marked refunded.");
      if (from !== "CANCELLED") throw new OrderActionError("Cancel the order before recording a refund.");
      await tx.storeOrder.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } });
      await tx.storeOrderEvent.create({ data: { orderId: order.id, actorType: actor.type, actorId: actor.id ?? null, actorLabel: actor.label, action: "REFUND_RECORDED", fromStatus: from, toStatus: from, note } });
      return { status: from, paymentStatus: "REFUNDED" as const };
    }

    const to = ORDER_ACTIONS[action as keyof typeof ORDER_ACTIONS] as OrderStatus | undefined;
    if (!to) throw new OrderActionError("Unknown action.", 400);
    if (!canTransitionOrder(from, to)) {
      throw new OrderActionError(`An order that is ${ORDER_STATUS_LABEL[from].toLowerCase()} can't be marked ${ORDER_STATUS_LABEL[to].toLowerCase()}.`);
    }
    if (from === "NEW" && order.expiresAt < new Date() && to !== "REJECTED" && to !== "CANCELLED") {
      throw new OrderActionError("This request has expired. Ask the customer to place a new order.");
    }
    if ((to === "REJECTED" || to === "CANCELLED") && !note) throw new OrderActionError("Give a reason so the customer knows why.", 400);
    if (to === "READY_FOR_COLLECTION" && order.fulfilment !== "COLLECTION") throw new OrderActionError("This order is for delivery, not collection.");
    if (to === "DISPATCHED" && order.fulfilment !== "DELIVERY") throw new OrderActionError("This order is for collection, not delivery.");
    if (to === "COMPLETED" && order.paymentStatus !== "PAID") throw new OrderActionError("Record the payment before completing the order.");

    const data: Prisma.StoreOrderUncheckedUpdateManyInput = { status: to };
    let branchId = order.branchId;

    if (to === "CONFIRMED" && !order.stockDeducted) {
      branchId = branchId ?? (await fulfilmentBranchId(businessId, null, tx));
      if (!branchId) throw new OrderActionError("Your business has no active branch to fulfil from.");
      for (const item of order.items) {
        const dec = await tx.inventoryLevel.updateMany({
          where: { productId: item.productId, branchId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (dec.count !== 1) throw new OrderActionError(`Not enough stock of "${item.titleSnapshot}" to confirm this order. Adjust inventory or reject the order.`);
        await tx.inventoryMovement.create({
          data: { businessId, branchId, productId: item.productId, type: "STOCK_OUT", quantity: item.quantity, reason: `Insight Store order ${order.reference}`, referenceId: order.id, createdById: actor.userId ?? null },
        });
      }
      Object.assign(data, { stockDeducted: true, confirmedAt: new Date(), branchId });
    }
    if (to === "CANCELLED" && order.stockDeducted) {
      if (!branchId) throw new OrderActionError("The order's fulfilment branch no longer exists; adjust stock manually.");
      for (const item of order.items) {
        await tx.inventoryLevel.upsert({
          where: { productId_branchId: { productId: item.productId, branchId } },
          update: { quantity: { increment: item.quantity } },
          create: { productId: item.productId, branchId, quantity: item.quantity },
        });
        await tx.inventoryMovement.create({
          data: { businessId, branchId, productId: item.productId, type: "RETURNED", quantity: item.quantity, reason: `Insight Store order ${order.reference} cancelled`, referenceId: order.id, createdById: actor.userId ?? null },
        });
      }
      Object.assign(data, { stockDeducted: false });
    }
    if (to === "COMPLETED") Object.assign(data, { completedAt: new Date() });

    const u = await tx.storeOrder.updateMany({ where: { id: order.id, status: from }, data });
    if (u.count !== 1) throw new OrderActionError("The order changed while you were working. Refresh and try again.");
    await tx.storeOrderEvent.create({
      data: { orderId: order.id, actorType: actor.type, actorId: actor.id ?? null, actorLabel: actor.label, action: action.toUpperCase(), fromStatus: from, toStatus: to, note },
    });
    return { status: to, paymentStatus: order.paymentStatus, productIds: order.items.map((i) => i.productId), stockChanged: to === "CONFIRMED" || (to === "CANCELLED" && order.stockDeducted) };
  }, { timeout: 20000, maxWait: 10000 });
}
