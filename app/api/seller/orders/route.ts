import { NextResponse } from "next/server";
import type { Prisma, StoreOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { expireStaleOrders } from "@/lib/store/server";

const STATUSES = ["NEW", "CONFIRMED", "AWAITING_PAYMENT", "PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"];

// GET /api/seller/orders?status=&q=&cursor=
export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "store:read")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const seller = await prisma.storeSeller.findUnique({ where: { businessId: session.businessId }, select: { id: true } });
  if (!seller) return NextResponse.json({ error: "Your business is not an approved Insight Store seller.", code: "STORE_NOT_AVAILABLE" }, { status: 403 });
  await expireStaleOrders({ businessId: session.businessId });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") ?? "").trim();
  const cursor = url.searchParams.get("cursor");
  const where: Prisma.StoreOrderWhereInput = {
    businessId: session.businessId,
    ...(status === "OPEN" ? { status: { in: ["NEW", "CONFIRMED", "AWAITING_PAYMENT", "PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED"] } } : status && STATUSES.includes(status) ? { status: status as StoreOrderStatus } : {}),
    ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q } }] } : {}),
  };
  const [orders, counts] = await Promise.all([
    prisma.storeOrder.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, reference: true, status: true, paymentStatus: true, currency: true, subtotal: true, customerName: true, customerPhone: true, fulfilment: true, createdAt: true, expiresAt: true, attributionChannel: true, _count: { select: { items: true } } },
    }),
    prisma.storeOrder.groupBy({ by: ["status"], where: { businessId: session.businessId }, _count: { _all: true } }),
  ]);
  const page = orders.slice(0, 30);
  return NextResponse.json({
    orders: page.map((o) => ({ ...o, subtotal: Number(o.subtotal) })),
    nextCursor: orders.length > 30 ? page[page.length - 1].id : null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
}
