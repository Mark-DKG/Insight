import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

export async function GET(request: Request) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const u = new URL(request.url).searchParams;
  const status = u.get("status");
  const q = (u.get("q") ?? "").trim();
  const where: Prisma.StoreSellerWhereInput = {
    ...(status === "ACTIVE" || status === "SUSPENDED" ? { status } : {}),
    ...(q ? { OR: [{ slug: { contains: q.toLowerCase() } }, { business: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const sellers = await prisma.storeSeller.findMany({
    where, orderBy: { approvedAt: "desc" }, take: 200,
    select: {
      id: true, slug: true, status: true, isFeatured: true, approvedAt: true, suspendedAt: true, suspendedReason: true, city: true, whatsappNumber: true,
      business: { select: { id: true, name: true, appMode: true, status: true, _count: { select: { storeListings: true, storeOrders: true } } } },
    },
  });
  const live = await prisma.storeListing.groupBy({ by: ["businessId"], where: { status: "PUBLISHED", businessId: { in: sellers.map((s) => s.business.id) } }, _count: { _all: true } });
  const liveBy = new Map(live.map((l) => [l.businessId, l._count._all]));
  return NextResponse.json({ sellers: sellers.map((s) => ({ ...s, liveListings: liveBy.get(s.business.id) ?? 0, hasWhatsApp: !!s.whatsappNumber, whatsappNumber: undefined })) });
}
