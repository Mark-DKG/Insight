import { NextResponse } from "next/server";
import type { Prisma, StoreOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";
import { expireStaleOrders } from "@/lib/store/server";

const STATUSES = ["NEW", "CONFIRMED", "AWAITING_PAYMENT", "PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"];

// Read-only oversight of marketplace orders. Customer contact details are
// masked here; the full order (with an audit entry) is in the detail view.
export async function GET(request: Request) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  await expireStaleOrders();
  const u = new URL(request.url).searchParams;
  const status = u.get("status");
  const q = (u.get("q") ?? "").trim();
  const where: Prisma.StoreOrderWhereInput = {
    ...(status && STATUSES.includes(status) ? { status: status as StoreOrderStatus } : {}),
    ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { business: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const orders = await prisma.storeOrder.findMany({
    where, orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, reference: true, status: true, paymentStatus: true, currency: true, subtotal: true, fulfilment: true, createdAt: true, expiresAt: true, attributionChannel: true, whatsappOpenedAt: true, customerName: true, business: { select: { id: true, name: true } }, _count: { select: { items: true } } },
  });
  return NextResponse.json({ orders: orders.map((o) => ({ ...o, subtotal: Number(o.subtotal), customerName: o.customerName.replace(/^(\S)\S*(\s+(\S).*)?$/, (_m, a, _b, c) => `${a}.${c ? ` ${c}.` : ""}`) })) });
}
