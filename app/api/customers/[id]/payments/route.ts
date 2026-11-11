import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";

// POST /api/customers/[id]/payments
//
// A payment isn't necessarily against one specific sale — a customer might
// pay GHS 400 against a combined balance built up over several credit
// sales. This applies the payment oldest-account-first (the customer's
// longest-outstanding debt), which is the most defensible default absent
// the person specifying otherwise, and splits it across accounts as needed.

const RecordPaymentSchema = z.object({
  amount: z.number().positive("Payment amount must be greater than zero."),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT", "OTHER"]),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "customers:write")) {
    return NextResponse.json({ error: "You don't have permission to record payments." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "customers");
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = RecordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payment." }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({ where: { id: params.id, ...tenantScope(session) } });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  if (parsed.data.amount > Number(customer.creditBalance)) {
    return NextResponse.json(
      { error: `Payment of ${parsed.data.amount} exceeds the outstanding balance of ${customer.creditBalance}.` },
      { status: 400 }
    );
  }

  // Prisma can't compare two columns of the same row in a `where` clause
  // portably, so the "still has a balance" filter happens in application
  // code after fetching this customer's accounts oldest-first.
  const allAccounts = await prisma.creditAccount.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "asc" },
  });
  const stillOpen = allAccounts.filter((a) => Number(a.amountPaid) < Number(a.originalAmount));

  let remaining = new Prisma.Decimal(parsed.data.amount);

  const result = await prisma.$transaction(async (tx) => {
    for (const account of stillOpen) {
      if (remaining.lte(0)) break;
      const outstanding = account.originalAmount.sub(account.amountPaid);
      const applied = Prisma.Decimal.min(outstanding, remaining);

      await tx.creditPayment.create({
        data: { creditAccountId: account.id, amount: applied, paymentMethod: parsed.data.method },
      });
      await tx.creditAccount.update({
        where: { id: account.id },
        data: { amountPaid: { increment: applied } },
      });

      remaining = remaining.sub(applied);
    }

    const updatedCustomer = await tx.customer.update({
      where: { id: customer.id },
      data: { creditBalance: { decrement: new Prisma.Decimal(parsed.data.amount) } },
    });

    await tx.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "CUSTOMER_PAYMENT_RECORDED",
        entityType: "Customer",
        entityId: customer.id,
        newValue: { amount: parsed.data.amount, method: parsed.data.method },
      },
    });

    return updatedCustomer;
  });

  return NextResponse.json({ customer: result }, { status: 201 });
}
