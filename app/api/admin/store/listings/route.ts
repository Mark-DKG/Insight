import { NextResponse } from "next/server";
import type { Prisma, ListingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";
import { availabilityFor } from "@/lib/store/server";

const STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "UNPUBLISHED"];

export async function GET(request: Request) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const u = new URL(request.url).searchParams;
  const status = u.get("status");
  const q = (u.get("q") ?? "").trim();
  const where: Prisma.StoreListingWhereInput = {
    ...(status === "PENDING" ? { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } : status && STATUSES.includes(status) ? { status: status as ListingStatus } : { status: { not: "DRAFT" } }),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { business: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const listings = await prisma.storeListing.findMany({
    where, orderBy: [{ submittedAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }], take: 200,
    include: {
      product: { select: { name: true, sku: true, sellingPrice: true, isActive: true, imageUrl: true } },
      category: { select: { name: true } },
      images: { select: { id: true }, orderBy: { sortOrder: "asc" } },
      business: { select: { id: true, name: true, currency: true, storeSeller: { select: { status: true, slug: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  const stock = await availabilityFor(listings.map((l) => ({ productId: l.productId, businessId: l.businessId })));
  return NextResponse.json({
    listings: listings.map((l) => ({
      ...l, price: l.price === null ? null : Number(l.price), effectivePrice: Number(l.price ?? l.product.sellingPrice),
      product: { ...l.product, sellingPrice: Number(l.product.sellingPrice) }, available: stock.get(l.productId) ?? 0,
    })),
  });
}
