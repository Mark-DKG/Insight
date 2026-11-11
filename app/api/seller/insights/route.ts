import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET /api/seller/insights — 30-day marketplace summary for the seller:
// order counts and value by status, and share/visit/order counts by channel
// (Insight's own link counts; no social network data).
export async function GET() {
  const session = await getSession();
  if (!requirePermission(session, "store:read")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const since = new Date(Date.now() - 30 * 86400_000);
  const businessId = session.businessId;
  const [orders, completed, attribution, listings] = await Promise.all([
    prisma.storeOrder.groupBy({ by: ["status"], where: { businessId, createdAt: { gte: since } }, _count: { _all: true }, _sum: { subtotal: true } }),
    prisma.storeOrder.aggregate({ where: { businessId, status: "COMPLETED", completedAt: { gte: since } }, _count: { _all: true }, _sum: { subtotal: true } }),
    prisma.storeAttributionEvent.groupBy({ by: ["channel", "event"], where: { businessId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.storeListing.groupBy({ by: ["status"], where: { businessId }, _count: { _all: true } }),
  ]);
  return NextResponse.json({
    since,
    ordersByStatus: Object.fromEntries(orders.map((o) => [o.status, { count: o._count._all, value: Number(o._sum.subtotal ?? 0) }])),
    completed: { count: completed._count._all, value: Number(completed._sum.subtotal ?? 0) },
    channels: attribution.map((a) => ({ channel: a.channel, event: a.event, count: a._count._all })),
    listingsByStatus: Object.fromEntries(listings.map((l) => [l.status, l._count._all])),
  });
}
