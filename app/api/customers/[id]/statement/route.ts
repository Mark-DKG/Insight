import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";

// GET /api/customers/[id]/statement — everything the Customers screen's
// statement panel needs in one call: credit accounts, their payments, and
// recent sales, newest first.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "customers:read")) {
    return NextResponse.json({ error: "You don't have access to view this customer." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "customers");
  if (blocked) return blocked;

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, ...tenantScope(session) },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const [creditAccounts, sales] = await Promise.all([
    prisma.creditAccount.findMany({
      where: { customerId: customer.id },
      include: { payments: { orderBy: { paidAt: "desc" } }, sale: { select: { receiptNumber: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sale.findMany({
      where: { customerId: customer.id, businessId: session.businessId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, receiptNumber: true, totalAmount: true, paymentMethod: true, status: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ customer, creditAccounts, sales });
}
