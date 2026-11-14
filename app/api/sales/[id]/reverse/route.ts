import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";
import { addStock } from "@/lib/stock";

// POST /api/sales/[id]/reverse — void or fully refund a completed sale.
// Financial records are never deleted (business rule #12): the sale stays,
// its status changes, stock is returned through an inventory movement, any
// credit it created is reversed, and the action is audit-logged.

const Schema = z.object({
  kind: z.enum(["VOID", "REFUND"]),
  reason: z.string().trim().min(3, "Please give a reason (at least 3 characters)."),
});

class ReverseError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

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
  const blocked = await moduleGate(session, "sales");
  if (blocked) return blocked;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Claim the sale with a conditional state transition. Only the request
      // that flips COMPLETED -> VOIDED/REFUNDED continues, so a double click,
      // two devices or a retry can never return stock, reverse credit or pay
      // money back twice; the loser sees "already reversed".
      const claimed = await tx.sale.updateMany({
        where: { id: params.id, ...tenantScope(session), status: "COMPLETED" },
        data: { status: kind === "VOID" ? "VOIDED" : "REFUNDED", voidedReason: reason },
      });
      if (claimed.count !== 1) {
        const existing = await tx.sale.findFirst({ where: { id: params.id, ...tenantScope(session) }, select: { status: true } });
        if (!existing) throw new ReverseError("Sale not found.", 404);
        throw new ReverseError(`This sale is already ${existing.status.toLowerCase()} and cannot be changed again.`);
      }

      const sale = await tx.sale.findFirstOrThrow({
        where: { id: params.id, ...tenantScope(session) },
        include: { items: true, creditAccount: { include: { payments: true } }, payments: true },
      });

      // Return stock to the branch the sale was made from.
      for (const item of [...sale.items].sort((x, y) => (x.productId < y.productId ? -1 : 1))) {
        await addStock(tx, item.productId, sale.branchId, item.quantity);
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
        // Serialise with concurrent customer payments on the same customer.
        await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${sale.customerId} FOR UPDATE`;
        const account = await tx.creditAccount.findUniqueOrThrow({ where: { id: sale.creditAccount.id } });
        const outstanding = account.originalAmount.sub(account.amountPaid);
        if (outstanding.gt(0)) {
          creditReversed = outstanding;
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { creditBalance: { decrement: outstanding } },
          });
          await tx.creditAccount.update({
            where: { id: account.id },
            data: { originalAmount: account.amountPaid },
          });
        }
      }

      // Money goes back out only for money that actually came in: the
      // sale-time payment for ordinary sales, or the customer's collections
      // for a credit sale. Unpaid credit never produces a cash payout.
      const receivedAtSale = sale.payments.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0)); // net of earlier refunds
      const collected = (sale.creditAccount?.payments ?? []).reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
      const refundable = receivedAtSale.add(collected);
      if (refundable.gt(0)) {
        const lastCollection = [...(sale.creditAccount?.payments ?? [])].sort((x, y) => y.paidAt.getTime() - x.paidAt.getTime())[0];
        await tx.payment.create({
          data: {
            saleId: sale.id,
            method: sale.paymentMethod === "CREDIT" ? (lastCollection?.paymentMethod ?? "OTHER") : sale.paymentMethod,
            amount: refundable.neg(),
            reference: `${kind === "VOID" ? "Void" : "Refund"}: ${reason}`,
          },
        });
      }

      const updated = await tx.sale.findFirstOrThrow({ where: { id: sale.id } });

      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          branchId: sale.branchId,
          action: kind === "VOID" ? "SALE_VOIDED" : "SALE_REFUNDED",
          entityType: "Sale",
          entityId: sale.id,
          previousValue: { status: "COMPLETED", totalAmount: sale.totalAmount.toString() },
          newValue: { status: updated.status, reason, creditReversed: creditReversed.toString(), moneyReturned: refundable.gt(0) ? refundable.toString() : "0" },
        },
      });

      return updated;
    }, { maxWait: 10000, timeout: 20000 });

    return NextResponse.json({ sale: result });
  } catch (error) {
    if (error instanceof ReverseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Sale reversal failed:", error);
    return NextResponse.json({ error: "The sale could not be changed. Nothing was modified." }, { status: 500 });
  }
}
