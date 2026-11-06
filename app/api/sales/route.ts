import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET /api/sales — recent transactions list (dashboard, sales history page)
export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "sales:read")) {
    return NextResponse.json({ error: "You don't have access to view sales." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? "20"));

  const sales = await prisma.sale.findMany({
    where: tenantScope(session),
    include: { cashier: { select: { name: true } }, customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ sales });
}

const SaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  discount: z.number().nonnegative().default(0),
});

const CreateSaleSchema = z.object({
  // Generated client-side (even while offline) so retried syncs of the same
  // sale are recognized as duplicates rather than double-charging inventory.
  clientTxnId: z.string().min(1),
  branchId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT", "OTHER"]),
  items: z.array(SaleItemSchema).min(1, "A sale needs at least one item."),
  discountPercent: z.number().min(0).max(100).default(0),
  creditDueDate: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "sales:create")) {
    return NextResponse.json({ error: "You don't have permission to record sales." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid sale data." }, { status: 400 });
  }
  const input = parsed.data;

  if (input.paymentMethod === "CREDIT" && !input.customerId) {
    return NextResponse.json({ error: "A credit sale must be linked to a customer." }, { status: 400 });
  }

  // Idempotency: if this exact client transaction was already recorded
  // (e.g. the offline queue retried a sync that actually succeeded), return
  // the existing sale instead of creating a duplicate.
  const existingSale = await prisma.sale.findUnique({
    where: { businessId_clientTxnId: { businessId: session.businessId, clientTxnId: input.clientTxnId } },
  });
  if (existingSale) {
    return NextResponse.json({ sale: existingSale, message: "Already recorded." }, { status: 200 });
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const productIds = input.items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId: session.businessId, isActive: true },
      });

      if (products.length !== productIds.length) {
        throw new SaleError("One or more products are unavailable or don't belong to this business.");
      }

      const inventoryLevels = await tx.inventoryLevel.findMany({
        where: { productId: { in: productIds }, branchId: input.branchId },
      });
      const levelByProduct = new Map(inventoryLevels.map((l) => [l.productId, l]));

      let subtotal = new Prisma.Decimal(0);
      let costOfGoods = new Prisma.Decimal(0);
      const saleItemsData: Prisma.SaleItemCreateManySaleInput[] = [];

      for (const item of input.items) {
        const product = products.find((p) => p.id === item.productId)!;
        const level = levelByProduct.get(item.productId);
        const available = level?.quantity ?? 0;

        // Business rule #2: inventory cannot go negative unless an
        // administrator has explicitly enabled it elsewhere — not done here.
        if (available < item.quantity) {
          throw new SaleError(
            `Sale could not be completed because the available stock for "${product.name}" is insufficient.`
          );
        }

        const lineTotal = product.sellingPrice.mul(item.quantity).sub(item.discount);
        const lineCost = product.costPrice.mul(item.quantity);

        subtotal = subtotal.add(lineTotal);
        costOfGoods = costOfGoods.add(lineCost);

        saleItemsData.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.sellingPrice,
          unitCost: product.costPrice,
          discount: new Prisma.Decimal(item.discount),
          lineTotal,
          lineProfit: lineTotal.sub(lineCost),
        });
      }

      const discountAmount = subtotal.mul(input.discountPercent).div(100);
      const totalAmount = subtotal.sub(discountAmount);
      const grossProfit = subtotal.sub(discountAmount).sub(costOfGoods);

      const receiptNumber = await nextReceiptNumber(tx, session.businessId);

      const created = await tx.sale.create({
        data: {
          businessId: session.businessId,
          branchId: input.branchId,
          cashierId: session.sub,
          customerId: input.customerId,
          receiptNumber,
          subtotal,
          discountAmount,
          taxAmount: new Prisma.Decimal(0),
          totalAmount,
          costOfGoods,
          grossProfit,
          paymentMethod: input.paymentMethod,
          clientTxnId: input.clientTxnId,
          status: "COMPLETED",
          items: { createMany: { data: saleItemsData } },
          payments: {
            create: { method: input.paymentMethod, amount: totalAmount },
          },
        },
        include: { items: true },
      });

      // Decrement inventory and log the movement for every line item.
      for (const item of input.items) {
        await tx.inventoryLevel.update({
          where: { productId_branchId: { productId: item.productId, branchId: input.branchId } },
          data: { quantity: { decrement: item.quantity } },
        });

        await tx.inventoryMovement.create({
          data: {
            businessId: session.businessId,
            branchId: input.branchId,
            productId: item.productId,
            type: "STOCK_OUT",
            quantity: -item.quantity,
            referenceId: created.id,
            createdById: session.sub,
          },
        });
      }

      // Credit sales open (or add to) the customer's credit account and
      // running balance; business rule #9.
      if (input.paymentMethod === "CREDIT" && input.customerId) {
        await tx.creditAccount.create({
          data: {
            customerId: input.customerId,
            saleId: created.id,
            originalAmount: totalAmount,
            dueDate: input.creditDueDate ? new Date(input.creditDueDate) : undefined,
          },
        });
        await tx.customer.update({
          where: { id: input.customerId },
          data: { creditBalance: { increment: totalAmount } },
        });
      }

      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          action: "SALE_COMPLETED",
          entityType: "Sale",
          entityId: created.id,
          newValue: { receiptNumber, totalAmount: totalAmount.toString() },
        },
      });

      return created;
    });

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof SaleError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Sale creation failed:", error);
    return NextResponse.json(
      { error: "Sale could not be completed due to an unexpected error. No charge was recorded." },
      { status: 500 }
    );
  }
}

class SaleError extends Error {}

async function nextReceiptNumber(tx: Prisma.TransactionClient, businessId: string): Promise<string> {
  const count = await tx.sale.count({ where: { businessId } });
  return `RCT-${String(count + 1).padStart(5, "0")}`;
}
