import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const order = await prisma.storeOrder.findUnique({
    where: { id: params.id },
    include: { items: true, events: { orderBy: { createdAt: "asc" } }, business: { select: { id: true, name: true } }, branch: { select: { name: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  await platformAudit(ctx, { action: "STORE_ORDER_VIEWED", targetBusinessId: order.businessId, targetType: "StoreOrder", targetId: order.id });
  const { lookupTokenHash: _h, ...safe } = order;
  return NextResponse.json({ order: { ...safe, subtotal: Number(order.subtotal), items: order.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) })) } });
}
