import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requireSeller } from "@/lib/store/server";

export const dynamic = "force-dynamic";

// GET /api/seller/reviews?filter=all|unanswered|reported — the seller's own
// store and product reviews (hidden ones excluded; those are moderator-only).
export async function GET(request: Request) {
  const g = await requireSeller(await getSession(), "store:read");
  if (g instanceof NextResponse) return g;
  const filter = new URL(request.url).searchParams.get("filter") ?? "all";
  const rows = await prisma.storeReview.findMany({
    where: {
      businessId: g.session.businessId, status: "VISIBLE",
      ...(filter === "unanswered" ? { sellerReply: null } : {}),
      ...(filter === "reported" ? { reports: { some: { resolvedAt: null } } } : {}),
    },
    orderBy: { createdAt: "desc" }, take: 200,
    include: { listing: { select: { id: true, title: true } }, reports: { where: { reporterType: "SELLER" }, select: { id: true } } },
  });
  const agg = await prisma.storeReview.groupBy({ by: ["kind"], where: { businessId: g.session.businessId, status: "VISIBLE" }, _avg: { rating: true }, _count: { _all: true } });
  return NextResponse.json({
    reviews: rows.map((r) => ({
      id: r.id, kind: r.kind, rating: r.rating, comment: r.comment, displayName: r.displayName, createdAt: r.createdAt,
      sellerReply: r.sellerReply, sellerRepliedAt: r.sellerRepliedAt, product: r.listing ? { id: r.listing.id, title: r.listing.title } : null,
      reportedByYou: r.reports.length > 0,
    })),
    summary: agg.map((a) => ({ kind: a.kind, average: Math.round((a._avg.rating ?? 0) * 10) / 10, count: a._count._all })),
  });
}
