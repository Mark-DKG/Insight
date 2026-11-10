import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// POST /api/sales/[id]/reverse — void or fully refund a completed sale.
// Financial records are never deleted (business rule #12): the sale stays,
// its status changes, stock is returned through an inventory movement, any
// credit it created is reversed, and the action is audit-logged.

const Schema = z.object({
  kind: z.enum(["VOID", "REFUND"]),
  reason: z.string().trim().min(3, "Please give a reason (at least 3 characters)."),
});

class ReverseError extends Error {}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { kind, reason } = parsed.data;

  const needed = kind === "VOID" ? "sales:void" : "sales:refund";
  if (!requirePermission(session, needed)) {
    return NextResponse.json(
      { error: `You don't have permission to ${kind === "VOID" ? "void" : "refund"} sales.` },
      { status: 403 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: params.id, ...tenantScope(session) },
        include: { items: true, creditAccount: true },
      });
      if (!sale) throw new ReverseError("Sale not found.");
      if (sale.status !== "COMPLETED") {
        throw new ReverseError(`This sale is already ${sale.status.toLowerCase()} and cannot be changed again.`);
      }

      // Return stock to the branch the sale was made from.
      for (const item of sale.items) {
        await tx.inventoryLevel.upsert({
          where: { productId_branchId: { productId: item.productId, branchId: sale.branchId } },
          update: { quantity: { increment: item.quantity } },
          create: { productId: item.productId, branchId: sale.branchId, quantity: item.quantity },
        });
        await tx.inventoryMovement.create({
          data: {
            businessId: session.businessId,
            branchId: sale.branchId,
            productId: item.productId,
            type: "RETURNED",
            quantity: item.quantity,
            reason: `${kind === "VOID" ? "Void" : "Refund"} of ${sale.receiptNumber}: ${reason}`,
            referenceId: sale.id,
            createdById: session.sub,
          },
        });
      }

      // Reverse credit: remove only the still-unpaid part from the customer's
      // balance, and close the credit account at what was actually paid.
      let creditReversed = new Prisma.Decimal(0);
      if (sale.creditAccount && sale.customerId) {
        const outstanding = sale.creditAccount.originalAmount.sub(sale.creditAccount.amountPaid);
        if (outstanding.gt(0)) {
          creditReversed = outstanding;
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { creditBalance: { decrement: outstanding } },
          });
          await tx.creditAccount.update({
            where: { id: sale.creditAccount.id },
            data: { originalAmount: sale.creditAccount.amountPaid },
          });
        }
      }

      // A refund also records the money going back out as a negative payment.
      if (kind === "REFUND") {
        await tx.payment.create({
          data: {
            saleId: sale.id,
            method: sale.paymentMethod,
            amount: sale.totalAmount.neg(),
            reference: `Refund: ${reason}`,
          },
        });
      }

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: { status: kind === "VOID" ? "VOIDED" : "REFUNDED", voidedReason: reason },
      });

      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          branchId: sale.branchId,
          action: kind === "VOID" ? "SALE_VOIDED" : "SALE_REFUNDED",
          entityType: "Sale",
          entityId: sale.id,
          previousValue: { status: sale.status, totalAmount: sale.totalAmount.toString() },
          newValue: { status: updated.status, reason, creditReversed: creditReversed.toString() },
        },
      });

      return updated;
    });

    return NextResponse.json({ sale: result });
  } catch (error) {
    if (error instanceof ReverseError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Sale reversal failed:", error);
    return NextResponse.json({ error: "The sale could not be changed. Nothing was modified." }, { status: 500 });
  }
}
