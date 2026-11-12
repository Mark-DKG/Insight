import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentShopper } from "@/lib/store/shopper";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/store/core";

export const dynamic = "force-dynamic";

// GET /api/store/public/account/orders — the signed-in shopper's order
// requests, newest first. Only orders placed while signed in appear here.
export async function GET() {
  const s = await currentShopper();
  if (!s) return NextResponse.json({ error: "Sign in to see your orders." }, { status: 401 });
  const rows = await prisma.storeOrder.findMany({
    where: { shopperId: s.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: { select: { quantity: true } }, business: { select: { name: true, storeSeller: { select: { slug: true } } } } },
  });
  return NextResponse.json({
    orders: rows.map((o) => ({
      reference: o.reference, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status as OrderStatus],
      seller: o.business.name, currency: o.currency, subtotal: Number(o.subtotal),
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0), createdAt: o.createdAt, path: `/store/orders/${o.reference}`,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
