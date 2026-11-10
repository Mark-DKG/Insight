import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET /api/sales/[id] — full sale detail: everything a receipt needs.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "sales:read")) {
    return NextResponse.json({ error: "You don't have access to view sales." }, { status: 403 });
  }

  const sale = await prisma.sale.findFirst({
    where: { id: params.id, ...tenantScope(session) },
    include: {
      items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
      payments: true,
      cashier: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      branch: { select: { name: true, address: true, phone: true } },
      creditAccount: { select: { originalAmount: true, amountPaid: true, dueDate: true } },
    },
  });
  if (!sale) {
    return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  }

  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: { name: true, address: true, phone: true, email: true, currency: true },
  });

  return NextResponse.json({ sale, business });
}
