import { prisma } from "@/lib/prisma";
import { summarise, type RatingSummary, REVIEW_PAGE_SIZE } from "./reviews-core";

// Database side of Insight Store reviews.

export type Eligibility = { canReview: boolean; reason: string | null; orderId?: string };

/** A shopper may review a product after a COMPLETED order that contained it. */
export async function productEligibility(shopperId: string, listingId: string): Promise<Eligibility> {
  const order = await prisma.storeOrder.findFirst({
    where: { shopperId, status: "COMPLETED", items: { some: { listingId } } },
    select: { id: true },
    orderBy: { completedAt: "desc" },
  });
  return order ? { canReview: true, reason: null, orderId: order.id } : { canReview: false, reason: "You can review a product after an order containing it is completed." };
}

/** A shopper may review a store after a COMPLETED order from that seller. */
export async function storeEligibility(shopperId: string, businessId: string): Promise<Eligibility> {
  const order = await prisma.storeOrder.findFirst({
    where: { shopperId, businessId, status: "COMPLETED" },
    select: { id: true },
    orderBy: { completedAt: "desc" },
  });
  return order ? { canReview: true, reason: null, orderId: order.id } : { canReview: false, reason: "You can review a store after one of your orders from it is completed." };
}

export type RatingBrief = { average: number; count: number };

/** Average and count of visible product reviews, by listing id. */
export async function listingRatings(listingIds: string[]): Promise<Map<string, RatingBrief>> {
  const out = new Map<string, RatingBrief>();
  if (listingIds.length === 0) return out;
  const rows = await prisma.storeReview.groupBy({
    by: ["listingId"], where: { listingId: { in: listingIds }, status: "VISIBLE", kind: "PRODUCT" }, _avg: { rating: true }, _count: { _all: true },
  });
  for (const r of rows) if (r.listingId) out.set(r.listingId, { average: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count._all });
  return out;
}

export async function sellerRating(businessId: string): Promise<RatingBrief | null> {
  const r = await prisma.storeReview.aggregate({ where: { businessId, kind: "STORE", status: "VISIBLE" }, _avg: { rating: true }, _count: { _all: true } });
  return r._count._all ? { average: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count._all } : null;
}

export async function reviewSummary(where: { listingId?: string; businessId?: string; kind: "PRODUCT" | "STORE" }): Promise<RatingSummary> {
  const rows = await prisma.storeReview.findMany({ where: { ...where, status: "VISIBLE" }, select: { rating: true }, take: 5000 });
  return summarise(rows.map((r) => r.rating));
}

export const publicReview = (r: { id: string; rating: number; comment: string | null; displayName: string; createdAt: Date; updatedAt: Date; sellerReply: string | null; sellerRepliedAt: Date | null; shopperId?: string }) => ({
  id: r.id, rating: r.rating, comment: r.comment, displayName: r.displayName, createdAt: r.createdAt,
  edited: r.updatedAt.getTime() - r.createdAt.getTime() > 60_000,
  sellerReply: r.sellerReply, sellerRepliedAt: r.sellerRepliedAt,
});

export { REVIEW_PAGE_SIZE };
