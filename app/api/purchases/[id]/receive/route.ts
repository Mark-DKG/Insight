import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkStockAlerts } from "@/lib/notify";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// POST /api/purchases/[id]/receive
//
// This is the "stock in" counterpart to /api/sales' "stock out": it is the
// only place inventory quantities increase from a purchase, and it is where
// the spec's section 18 rules apply literally —
//   "When inventory is received: increase stock, update cost records,
//    record inventory movement, update supplier balance, update product
//    costing."
// Partial receiving is supported: quantityReceived accumulates across
// multiple calls, and the purchase moves to RECEIVED only once every line
// is fully received.

const ReceiveSchema = z.object({
  lines: z
    .array(
      z.object({
        purchaseItemId: z.string().uuid(),
        quantityReceived: z.number().int().positive(),
      })
    )
    .min(1, "Specify at least one line to receive."),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "purchases:write")) {
    return NextResponse.json({ error: "You don't have permission to receive stock." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ReceiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid receiving data." }, { status: 400 });
  }

  const purchase = await prisma.purchase.findFirst({
    where: { id: params.id, businessId: session.businessId },
    include: { items: true },
  });
  if (!purchase) {
    return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
  }
  if (purchase.status === "RECEIVED" || purchase.status === "CANCELLED") {
    return NextResponse.json(
      { error: `This purchase order is already ${purchase.status.toLowerCase()} and can't receive more stock.` },
      { status: 409 }
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      let receivedValueThisPass = new Prisma.Decimal(0);

      for (const line of parsed.data.lines) {
        const item = purchase.items.find((i) => i.id === line.purchaseItemId);
        if (!item) {
          throw new ReceiveError("One of the specified line items doesn't belong to this purchase order.");
        }

        const remaining = item.quantityOrdered - item.quantityReceived;
        if (line.quantityReceived > remaining) {
          throw new ReceiveError(
            `Cannot receive ${line.quantityReceived} units — only ${remaining} remain outstanding on this line.`
          );
        }

        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { quantityReceived: { increment: line.quantityReceived } },
        });

        // Increase stock at the purchase's branch.
        await tx.inventoryLevel.upsert({
          where: { productId_branchId: { productId: item.productId, branchId: purchase.branchId } },
          create: { productId: item.productId, branchId: purchase.branchId, quantity: line.quantityReceived },
          update: { quantity: { increment: line.quantityReceived } },
        });

        await tx.inventoryMovement.create({
          data: {
            businessId: session.businessId,
            branchId: purchase.branchId,
            productId: item.productId,
            type: "STOCK_IN",
            quantity: line.quantityReceived,
            referenceId: purchase.id,
            createdById: session.sub,
          },
        });

        // Update the product's cost basis to the latest purchase cost.
        // (Schema note: this is a "last cost" update; weighted-average
        // costing would compute a blended cost here instead — the field
        // is designed to support that without a migration.)
        await tx.product.update({
          where: { id: item.productId },
          data: { costPrice: item.unitCost },
        });

        receivedValueThisPass = receivedValueThisPass.add(item.unitCost.mul(line.quantityReceived));
      }

      const refreshedItems = await tx.purchaseItem.findMany({ where: { purchaseId: purchase.id } });
      const fullyReceived = refreshedItems.every((i) => i.quantityReceived >= i.quantityOrdered);
      const partiallyReceived = refreshedItems.some((i) => i.quantityReceived > 0);

      const newStatus = fullyReceived ? "RECEIVED" : partiallyReceived ? "PARTIALLY_RECEIVED" : purchase.status;

      const updatedPurchase = await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: newStatus, receivedAt: fullyReceived ? new Date() : purchase.receivedAt },
        include: { items: true },
      });

      // The business now owes the supplier for what was actually received.
      await tx.supplier.update({
        where: { id: purchase.supplierId },
        data: { outstandingBalance: { increment: receivedValueThisPass } },
      });

      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          action: "PURCHASE_STOCK_RECEIVED",
          entityType: "Purchase",
          entityId: purchase.id,
          newValue: { status: newStatus, receivedValue: receivedValueThisPass.toString() },
        },
      });

      return updatedPurchase;
    });

    await checkStockAlerts(session.businessId, purchase.items.map((i) => i.productId)).catch((e) => console.error("Stock alert check failed:", e));
    return NextResponse.json({ purchase: updated });
  } catch (error) {
    if (error instanceof ReceiveError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Receiving stock failed:", error);
    return NextResponse.json(
      { error: "Stock could not be received due to an unexpected error. No inventory was changed." },
      { status: 500 }
    );
  }
}

class ReceiveError extends Error {}
