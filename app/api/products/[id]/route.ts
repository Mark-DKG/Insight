import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

async function findOwnedProduct(businessId: string, id: string) {
  return prisma.product.findFirst({ where: { id, businessId } });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "products:read")) {
    return NextResponse.json({ error: "You don't have access to view this product." }, { status: 403 });
  }

  const product = await prisma.product.findFirst({
    where: { id: params.id, ...tenantScope(session) },
    include: { category: true, supplier: true, inventoryLevels: { include: { branch: true } } },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({ product });
}

const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  costPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  minStockLevel: z.number().int().nonnegative().optional(),
  maxStockLevel: z.number().int().positive().nullable().optional(),
  unit: z.string().optional(),
  taxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "products:write")) {
    return NextResponse.json({ error: "You don't have permission to edit products." }, { status: 403 });
  }

  const existing = await findOwnedProduct(session.businessId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id: existing.id }, data: parsed.data });

    // Price changes affect margin and should be traceable, per the audit
    // requirements in the spec (section 50).
    if (parsed.data.costPrice !== undefined || parsed.data.sellingPrice !== undefined) {
      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          action: "PRODUCT_PRICE_CHANGED",
          entityType: "Product",
          entityId: product.id,
          previousValue: { costPrice: existing.costPrice, sellingPrice: existing.sellingPrice },
          newValue: { costPrice: product.costPrice, sellingPrice: product.sellingPrice },
        },
      });
    }

    return product;
  });

  return NextResponse.json({ product: updated });
}

// Products are never hard-deleted: doing so would destroy historical sale
// line items. "Delete" here means deactivate, per business rule #11.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "products:write")) {
    return NextResponse.json({ error: "You don't have permission to remove products." }, { status: 403 });
  }

  const existing = await findOwnedProduct(session.businessId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.product.update({ where: { id: existing.id }, data: { isActive: false } }),
    prisma.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "PRODUCT_DEACTIVATED",
        entityType: "Product",
        entityId: existing.id,
      },
    }),
  ]);

  return NextResponse.json({ message: "Product removed from active inventory." });
}
