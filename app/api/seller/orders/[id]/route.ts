import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { expireStaleOrders, availabilityFor } from "@/lib/store/server";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:read")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  await expireStaleOrders({ id: params.id, businessId: session.businessId });
  const order = await prisma.storeOrder.findFirst({
    where: { id: params.id, businessId: session.businessId },
    include: { items: true, events: { orderBy: { createdAt: "asc" } }, branch: { select: { id: true, name: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const stock = order.status === "NEW" ? await availabilityFor(order.items.map((i) => ({ productId: i.productId, businessId: order.businessId }))) : null;
  const { lookupTokenHash: _omit, ...safe } = order;
  return NextResponse.json({
    order: {
      ...safe, subtotal: Number(order.subtotal),
      items: order.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal), available: stock ? stock.get(i.productId) ?? 0 : null })),
    },
  });
}
