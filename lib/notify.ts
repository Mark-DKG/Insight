import type { Prisma, PrismaClient, NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { emailStockAlert } from "./email/events";

// ----------------------------------------------------------------------------
// Notifications
//
// Business notifications are delivered per user (one row per recipient), so
// unread counts and read state are exact for each person. A dedupeKey makes
// creation idempotent: the same event never notifies the same user twice.
// Platform (admin) notifications are shared rows with per-admin read records.
// ----------------------------------------------------------------------------

type Db = PrismaClient | Prisma.TransactionClient;
type Role = "OWNER" | "MANAGER" | "CASHIER";

export interface BusinessNotice {
  businessId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  dedupeKey?: string;
  /** Who receives it. Defaults to Owners and Managers. */
  roles?: Role[];
  userIds?: string[];
}

export async function notifyBusiness(notice: BusinessNotice, db: Db = prisma) {
  const recipients = notice.userIds?.length
    ? notice.userIds
    : (
        await db.user.findMany({
          where: { businessId: notice.businessId, isActive: true, role: { in: notice.roles ?? ["OWNER", "MANAGER"] } },
          select: { id: true },
        })
      ).map((u) => u.id);
  if (recipients.length === 0) return 0;
  const result = await db.notification.createMany({
    data: recipients.map((userId) => ({
      businessId: notice.businessId,
      userId,
      type: notice.type,
      title: notice.title.slice(0, 200),
      message: notice.message.slice(0, 1000),
      link: notice.link ?? null,
      dedupeKey: notice.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export interface PlatformNotice {
  type: string;
  title: string;
  message: string;
  link?: string;
  dedupeKey?: string;
}

export async function notifyPlatform(notice: PlatformNotice, db: Db = prisma) {
  await db.platformNotification.createMany({
    data: [{ type: notice.type, title: notice.title.slice(0, 200), message: notice.message.slice(0, 1000), link: notice.link ?? null, dedupeKey: notice.dedupeKey ?? null }],
    skipDuplicates: true,
  });
}

/**
 * Low/out-of-stock alerts for products whose level just changed. Deduped per
 * product and state, and re-armed once stock recovers above the minimum, so
 * a product that keeps selling while low does not spam everyone.
 */
export async function checkStockAlerts(businessId: string, productIds: string[], db: Db = prisma) {
  if (productIds.length === 0) return;
  const levels = await db.inventoryLevel.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, quantity: true, product: { select: { name: true, minStockLevel: true, businessId: true } } },
  });
  const totals = new Map<string, { name: string; min: number; qty: number }>();
  for (const l of levels) {
    if (l.product.businessId !== businessId) continue;
    const t = totals.get(l.productId) ?? { name: l.product.name, min: l.product.minStockLevel, qty: 0 };
    t.qty += l.quantity;
    totals.set(l.productId, t);
  }
  for (const [productId, t] of totals) {
    if (t.qty <= 0) {
      await notifyBusiness({
        businessId, type: "OUT_OF_STOCK", title: `${t.name} is out of stock`,
        message: `${t.name} has no stock left across your branches.`, link: "/inventory",
        dedupeKey: `stock:out:${productId}`,
      }, db);
      await emailStockAlert(businessId, productId, "out", { name: t.name, qty: 0, min: t.min });
    } else if (t.qty <= t.min) {
      await notifyBusiness({
        businessId, type: "LOW_STOCK", title: `${t.name} is running low`,
        message: `${t.qty} left (minimum ${t.min}).`, link: "/inventory",
        dedupeKey: `stock:low:${productId}`,
      }, db);
      await emailStockAlert(businessId, productId, "low", { name: t.name, qty: t.qty, min: t.min });
    } else {
      // Recovered: clear the dedupe keys so the next drop alerts again.
      await db.notification.updateMany({
        where: { businessId, dedupeKey: { in: [`stock:low:${productId}`, `stock:out:${productId}`] } },
        data: { dedupeKey: null },
      });
    }
  }
}
