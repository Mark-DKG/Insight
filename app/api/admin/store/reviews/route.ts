import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

// GET ?filter=reported|hidden|all — reviews for moderation. Shopper email is
// never returned; moderators see the public name only.
export async function GET(request: Request) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const filter = new URL(request.url).searchParams.get("filter") ?? "reported";
  const where: Prisma.StoreReviewWhereInput =
    filter === "hidden" ? { status: "HIDDEN" } : filter === "all" ? {} : { status: "VISIBLE", reports: { some: { resolvedAt: null } } };
  const rows = await prisma.storeReview.findMany({
    where, orderBy: { createdAt: "desc" }, take: 200,
    include: {
      listing: { select: { id: true, title: true } }, business: { select: { name: true } },
      reports: { orderBy: { createdAt: "desc" }, select: { id: true, reporterType: true, reason: true, resolvedAt: true, createdAt: true } },
    },
  });
  return NextResponse.json({
    reviews: rows.map((r) => ({
      id: r.id, kind: r.kind, rating: r.rating, comment: r.comment, displayName: r.displayName, status: r.status, hiddenReason: r.hiddenReason,
      sellerReply: r.sellerReply, createdAt: r.createdAt, seller: r.business.name, product: r.listing ? { id: r.listing.id, title: r.listing.title } : null,
      openReports: r.reports.filter((p) => !p.resolvedAt), reportCount: r.reports.length,
    })),
  });
}
