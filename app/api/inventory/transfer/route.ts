import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// POST /api/inventory/transfer — move stock between two branches atomically.
const Schema = z.object({
  productId: z.string().uuid(),
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  quantity: z.number().int().positive("Enter a quantity greater than zero."),
  note: z.string().trim().optional(),
});

class TransferError extends Error {}

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "inventory:write")) {
    return NextResponse.json({ error: "You don't have permission to transfer stock." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid transfer." }, { status: 400 });
  }
  const input = parsed.data;
  if (input.fromBranchId === input.toBranchId) {
    return NextResponse.json({ error: "Choose two different branches." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [product, branches] = await Promise.all([
        tx.product.findFirst({ where: { id: input.productId, businessId: session.businessId } }),
        tx.branch.findMany({
          where: { id: { in: [input.fromBranchId, input.toBranchId] }, businessId: session.businessId },
        }),
      ]);
      if (!product) throw new TransferError("Product not found.");
      if (branches.length !== 2) throw new TransferError("Branch not found.");
      const from = branches.find((b) => b.id === input.fromBranchId)!;

      const source = await tx.inventoryLevel.findUnique({
        where: { productId_branchId: { productId: product.id, branchId: from.id } },
      });
      const available = source?.quantity ?? 0;
      if (available < input.quantity) {
        throw new TransferError(
          `Cannot transfer ${input.quantity} of "${product.name}": only ${available} in stock at ${from.name}.`
        );
      }

      await tx.inventoryLevel.update({
        where: { productId_branchId: { productId: product.id, branchId: input.fromBranchId } },
        data: { quantity: { decrement: input.quantity } },
      });
      await tx.inventoryLevel.upsert({
        where: { productId_branchId: { productId: product.id, branchId: input.toBranchId } },
        update: { quantity: { increment: input.quantity } },
        create: { productId: product.id, branchId: input.toBranchId, quantity: input.quantity },
      });

      const transferRef = crypto.randomUUID();
      await tx.inventoryMovement.createMany({
        data: [
          {
            businessId: session.businessId, branchId: input.fromBranchId, productId: product.id,
            type: "TRANSFER_OUT", quantity: -input.quantity, reason: input.note || undefined,
            referenceId: transferRef, createdById: session.sub,
          },
          {
            businessId: session.businessId, branchId: input.toBranchId, productId: product.id,
            type: "TRANSFER_IN", quantity: input.quantity, reason: input.note || undefined,
            referenceId: transferRef, createdById: session.sub,
          },
        ],
      });

      await tx.auditLog.create({
        data: {
          businessId: session.businessId, userId: session.sub, branchId: input.fromBranchId,
          action: "STOCK_TRANSFERRED", entityType: "Product", entityId: product.id,
          newValue: { from: input.fromBranchId, to: input.toBranchId, quantity: input.quantity },
        },
      });
    });

    return NextResponse.json({ message: "Transfer recorded." }, { status: 201 });
  } catch (error) {
    if (error instanceof TransferError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Stock transfer failed:", error);
    return NextResponse.json({ error: "The transfer could not be saved. Nothing was modified." }, { status: 500 });
  }
}
