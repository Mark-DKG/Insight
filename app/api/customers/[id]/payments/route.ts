import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
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

  if (parsed.data.method === "CREDIT") {
    return NextResponse.json({ error: "A credit payment must be made with cash, mobile money, bank transfer or card." }, { status: 400 });
  }

  class PaymentError extends Error {
    constructor(message: string, public status: number) { super(message); }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the customer row for the whole payment. Credit sales, payments
      // and reversals for this customer all take the same lock, so the balance
      // checked here is the balance that is updated, and two simultaneous
      // payments cannot both be accepted against the same debt.
      const rows = await tx.$queryRaw<{ creditBalance: Prisma.Decimal }[]>`
        SELECT "creditBalance" FROM "Customer" WHERE "id" = ${params.id} AND "businessId" = ${session.businessId} FOR UPDATE`;
      if (rows.length === 0) throw new PaymentError("Customer not found.", 404);
      const balance = new Prisma.Decimal(rows[0].creditBalance);
      const amount = new Prisma.Decimal(parsed.data.amount);

      if (amount.gt(balance)) {
        throw new PaymentError(`Payment of ${parsed.data.amount} exceeds the outstanding balance of ${balance.toString()}.`, 400);
      }

      // Prisma can't compare two columns of the same row in a `where` clause
      // portably, so the "still has a balance" filter happens in application
      // code after fetching this customer's accounts oldest-first.
      const allAccounts = await tx.creditAccount.findMany({
        where: { customerId: params.id },
        orderBy: { createdAt: "asc" },
      });
      const stillOpen = allAccounts.filter((a) => a.amountPaid.lt(a.originalAmount));

      let remaining = amount;
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
        where: { id: params.id },
        data: { creditBalance: { decrement: amount } },
      });

      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          action: "CUSTOMER_PAYMENT_RECORDED",
          entityType: "Customer",
          entityId: params.id,
          newValue: { amount: parsed.data.amount, method: parsed.data.method },
        },
      });

      return updatedCustomer;
    }, { maxWait: 10000, timeout: 20000 });

    return NextResponse.json({ customer: result }, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Customer payment failed:", error);
    return NextResponse.json({ error: "The payment could not be saved. Nothing was modified." }, { status: 500 });
  }
}
