import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkStockAlerts } from "@/lib/notify";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// POST /api/inventory/adjust — manual stock changes, each logged as a movement.
//
//   ADD types (quantity added):      STOCK_IN, RETURNED
//   REMOVE types (quantity removed): STOCK_OUT, DAMAGED, EXPIRED
//   ADJUSTMENT: signed delta (positive adds, negative removes)
//   COUNT_CORRECTION: pass `countedQuantity`; stock is set to the physical
//     count and the difference is recorded (stock-loss detection input).

const Schema = z.object({
  productId: z.string().uuid(),
  branchId: z.string().uuid(),
  type: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "DAMAGED", "EXPIRED", "RETURNED", "COUNT_CORRECTION"]),
  quantity: z.number().int().optional(),
  countedQuantity: z.number().int().nonnegative().optional(),
  reason: z.string().trim().optional(),
});

class AdjustError extends Error {}

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "inventory:adjust")) {
    return NextResponse.json({ error: "You don't have permission to adjust stock." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid adjustment." }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [product, branch] = await Promise.all([
        tx.product.findFirst({ where: { id: input.productId, businessId: session.businessId } }),
        tx.branch.findFirst({ where: { id: input.branchId, businessId: session.businessId } }),
      ]);
      if (!product) throw new AdjustError("Product not found.");
      if (!branch) throw new AdjustError("Branch not found.");

      const level = await tx.inventoryLevel.findUnique({
        where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      });
      const current = level?.quantity ?? 0;

      let delta: number;
      if (input.type === "COUNT_CORRECTION") {
        if (input.countedQuantity === undefined) throw new AdjustError("Enter the counted quantity.");
        delta = input.countedQuantity - current;
      } else {
        if (input.quantity === undefined || input.quantity === 0) throw new AdjustError("Enter a quantity.");
        if (input.type === "ADJUSTMENT") {
          delta = input.quantity;
        } else {
          const magnitude = Math.abs(input.quantity);
          delta = input.type === "STOCK_IN" || input.type === "RETURNED" ? magnitude : -magnitude;
        }
        if (input.type === "ADJUSTMENT" && !input.reason) throw new AdjustError("A reason is required for stock adjustments.");
      }

      if (delta === 0) throw new AdjustError("No change: the stock already matches that quantity.");
      if (current + delta < 0) {
        throw new AdjustError(
          `Cannot remove ${Math.abs(delta)} from "${product.name}": only ${current} in stock at ${branch.name}.`
        );
      }

      const updated = await tx.inventoryLevel.upsert({
        where: { productId_branchId: { productId: product.id, branchId: branch.id } },
        update: { quantity: current + delta },
        create: { productId: product.id, branchId: branch.id, quantity: current + delta },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          businessId: session.businessId,
          branchId: branch.id,
          productId: product.id,
          type: input.type,
          quantity: delta,
          reason: input.reason || undefined,
          createdById: session.sub,
        },
      });

      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          branchId: branch.id,
          action: "STOCK_ADJUSTED",
          entityType: "Product",
          entityId: product.id,
          previousValue: { quantity: current },
          newValue: { quantity: updated.quantity, type: input.type, reason: input.reason ?? null },
        },
      });

      return { quantity: updated.quantity, movement };
    });

    await checkStockAlerts(session.businessId, [input.productId]).catch((e) => console.error("Stock alert check failed:", e));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AdjustError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Stock adjustment failed:", error);
    return NextResponse.json({ error: "The stock change could not be saved. Nothing was modified." }, { status: 500 });
  }
}
