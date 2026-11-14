import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkStockAlerts } from "@/lib/notify";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";
import { removeStock } from "@/lib/stock";

// GET /api/sales — recent transactions list (dashboard, sales history page)
export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "sales:read")) {
    return NextResponse.json({ error: "You don't have access to view sales." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "sales");
  if (blocked) return blocked;

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
  // When the sale happened on the device. Honoured for offline sales synced
  // later (up to 7 days old, not in the future); otherwise the server time.
  occurredAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "sales:create")) {
    return NextResponse.json({ error: "You don't have permission to record sales." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "pos");
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = CreateSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid sale data." }, { status: 400 });
  }
  const input = parsed.data;

  // A cashier is bound to their assigned branch; the branch id from the
  // client is never trusted on its own.
  if (session.role === "CASHIER" && session.branchId && input.branchId !== session.branchId) {
    return NextResponse.json({ error: "You can only record sales for your own branch." }, { status: 403 });
  }

  let saleTimestamp: Date | null = null;
  if (input.occurredAt) {
    const t = new Date(input.occurredAt);
    const now = Date.now();
    if (t.getTime() <= now + 5 * 60 * 1000 && t.getTime() >= now - 7 * 24 * 60 * 60 * 1000) saleTimestamp = t;
  }

  if (input.paymentMethod === "CREDIT" && !input.customerId) {
    return NextResponse.json({ error: "A credit sale must be linked to a customer." }, { status: 400 });
  }

  // Idempotency: if this client transaction was already recorded (e.g. the
  // offline queue retried a sync that actually succeeded), return the
  // existing sale instead of creating a duplicate. A reused id with a
  // DIFFERENT payload is refused rather than silently returning the old sale.
  const replay = await replayExisting(session.businessId, input);
  if (replay) return replay;

  try {
    const sale = await prisma.$transaction(async (tx) => {
      // ---- ownership: branch and customer must belong to this business ----
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, businessId: session.businessId }, select: { id: true } });
      if (!branch) throw new SaleError("Branch not found for this business.", 404);
      // A cashier assigned to a branch can only sell from that branch.
      if (session.role === "CASHIER" && session.branchId && session.branchId !== branch.id) {
        throw new SaleError("You can only record sales for the branch you are assigned to.", 403);
      }

      let customer: { id: string; name: string } | null = null;
      if (input.customerId) {
        customer = await tx.customer.findFirst({ where: { id: input.customerId, businessId: session.businessId }, select: { id: true, name: true } });
        if (!customer) throw new SaleError("Customer not found for this business.", 404);
      }

      const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId: session.businessId, isActive: true },
      });
      if (products.length !== productIds.length) {
        throw new SaleError("One or more products are unavailable or don't belong to this business.");
      }

      let subtotal = new Prisma.Decimal(0);
      let costOfGoods = new Prisma.Decimal(0);
      const saleItemsData: Prisma.SaleItemCreateManySaleInput[] = [];

      for (const item of input.items) {
        const product = products.find((p) => p.id === item.productId)!;
        const gross = product.sellingPrice.mul(item.quantity);
        if (new Prisma.Decimal(item.discount).gt(gross)) {
          throw new SaleError(`The discount on "${product.name}" is larger than the line total.`, 400);
        }
        const lineTotal = gross.sub(item.discount);
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

      // ---- stock: one conditional UPDATE per line (see lib/stock.ts) -------
      // Business rule #2: inventory cannot go negative. Lines are processed in
      // a fixed order so concurrent multi-line sales cannot deadlock.
      const ordered = [...input.items].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
      for (const item of ordered) {
        if (!(await removeStock(tx, item.productId, input.branchId, item.quantity))) {
          const name = products.find((p) => p.id === item.productId)!.name;
          throw new SaleError(`Sale could not be completed because the available stock for "${name}" is insufficient.`);
        }
      }

      // ---- credit limit: enforced under a row lock on the customer ---------
      if (input.paymentMethod === "CREDIT" && customer) {
        const rows = await tx.$queryRaw<{ creditBalance: Prisma.Decimal; creditLimit: Prisma.Decimal }[]>`
          SELECT "creditBalance", "creditLimit" FROM "Customer" WHERE "id" = ${customer.id} AND "businessId" = ${session.businessId} FOR UPDATE`;
        const locked = rows[0];
        if (!locked) throw new SaleError("Customer not found for this business.", 404);
        const balance = new Prisma.Decimal(locked.creditBalance);
        const limit = new Prisma.Decimal(locked.creditLimit);
        if (limit.lte(0)) {
          throw new SaleError(`${customer.name} has no credit limit set, so credit sales are not allowed. Set a credit limit on the customer first.`);
        }
        if (balance.add(totalAmount).gt(limit)) {
          throw new SaleError(
            `This sale would take ${customer.name}'s credit to ${balance.add(totalAmount).toFixed(2)}, above their limit of ${limit.toFixed(2)} (currently owing ${balance.toFixed(2)}).`
          );
        }
      }

      // ---- the sale: receipt numbers are allocated under a per-business lock
      // held until commit, so concurrent sales cannot take the same number and
      // a rolled-back sale never consumes one. -------------------------------
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"receipt:" + session.businessId}))`;
      const receiptNumber = await nextReceiptNumber(tx, session.businessId);

      const isCredit = input.paymentMethod === "CREDIT";
      const created = await tx.sale.create({
        data: {
          businessId: session.businessId,
          branchId: input.branchId,
          cashierId: session.sub,
          ...(saleTimestamp ? { createdAt: saleTimestamp } : {}),
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
          // Money is recorded only when it is actually received. A credit
          // sale creates a credit account instead; collections are recorded as
          // CreditPayment rows when the customer pays.
          ...(isCredit ? {} : { payments: { create: { method: input.paymentMethod, amount: totalAmount } } }),
        },
        include: { items: true },
      });

      for (const item of ordered) {
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

      if (isCredit && customer) {
        await tx.creditAccount.create({
          data: {
            customerId: customer.id,
            saleId: created.id,
            originalAmount: totalAmount,
            dueDate: input.creditDueDate ? new Date(input.creditDueDate) : undefined,
          },
        });
        await tx.customer.update({
          where: { id: customer.id },
          data: { creditBalance: { increment: totalAmount } },
        });
      }

      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          branchId: input.branchId,
          action: "SALE_COMPLETED",
          entityType: "Sale",
          entityId: created.id,
          newValue: { receiptNumber, totalAmount: totalAmount.toString() },
        },
      });

      return created;
    }, { maxWait: 10000, timeout: 20000 });

    await checkStockAlerts(session.businessId, input.items.map((i) => i.productId)).catch((e) => console.error("Stock alert check failed:", e));
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof SaleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // Two requests with the same clientTxnId raced: the database's unique
    // constraint let exactly one through and rolled the other back completely
    // (stock included). Answer the loser with the sale that was recorded.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await replayExisting(session.businessId, input);
      if (again) return again;
    }
    console.error("Sale creation failed:", error);
    return NextResponse.json(
      { error: "Sale could not be completed due to an unexpected error. No charge was recorded." },
      { status: 500 }
    );
  }
}

class SaleError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

type SaleInput = z.infer<typeof CreateSaleSchema>;

async function replayExisting(businessId: string, input: SaleInput): Promise<NextResponse | null> {
  const existing = await prisma.sale.findUnique({
    where: { businessId_clientTxnId: { businessId, clientTxnId: input.clientTxnId } },
    include: { items: true },
  });
  if (!existing) return null;
  const key = (rows: { productId: string; quantity: number }[]) => rows.map((r) => `${r.productId}:${r.quantity}`).sort().join("|");
  const same =
    existing.branchId === input.branchId &&
    existing.paymentMethod === input.paymentMethod &&
    (existing.customerId ?? null) === (input.customerId ?? null) &&
    key(existing.items) === key(input.items);
  if (!same) {
    return NextResponse.json(
      { error: "This transaction id was already used for a different sale. Nothing was recorded.", code: "TXN_ID_CONFLICT" },
      { status: 409 }
    );
  }
  return NextResponse.json({ sale: existing, message: "Already recorded." }, { status: 200 });
}

async function nextReceiptNumber(tx: Prisma.TransactionClient, businessId: string): Promise<string> {
  const count = await tx.sale.count({ where: { businessId } });
  return `RCT-${String(count + 1).padStart(5, "0")}`;
}
