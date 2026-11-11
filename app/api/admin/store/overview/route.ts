import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";
import { getStoreConfig } from "@/lib/store/server";

export async function GET() {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const since = new Date(Date.now() - 30 * 86400_000);
  const [apps, sellers, listings, orders, completed, config, channels] = await Promise.all([
    prisma.storeSellerApplication.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.storeSeller.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.storeListing.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.storeOrder.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.storeOrder.aggregate({ where: { status: "COMPLETED", completedAt: { gte: since } }, _count: { _all: true }, _sum: { subtotal: true } }),
    getStoreConfig(),
    prisma.storeAttributionEvent.groupBy({ by: ["channel", "event"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const map = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  return NextResponse.json({
    applications: map(apps), sellers: map(sellers), listings: map(listings), orders30d: map(orders),
    completed30d: { count: completed._count._all, value: Number(completed._sum.subtotal ?? 0) },
    channels: channels.map((c) => ({ channel: c.channel, event: c.event, count: c._count._all })),
    config: { isOpen: config.isOpen, announcement: config.announcement },
    permissions: ctx.permissions,
  });
}
