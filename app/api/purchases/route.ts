import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "purchases:read")) {
    return NextResponse.json({ error: "You don't have access to view purchases." }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;

  const purchases = await prisma.purchase.findMany({
    where: { ...tenantScope(session), ...(status ? { status: status as any } : {}) },
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ purchases });
}

const CreatePurchaseSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  expectedAt: z.string().datetime().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantityOrdered: z.number().int().positive(),
        unitCost: z.number().nonnegative(),
      })
    )
    .min(1, "A purchase order needs at least one item."),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "purchases:write")) {
    return NextResponse.json({ error: "You don't have permission to create purchase orders." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreatePurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid purchase order." }, { status: 400 });
  }
  const input = parsed.data;

  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, businessId: session.businessId } });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  }

  const totalCost = input.items.reduce(
    (sum, item) => sum.add(new Prisma.Decimal(item.unitCost).mul(item.quantityOrdered)),
    new Prisma.Decimal(0)
  );

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        businessId: session.businessId,
        branchId: input.branchId,
        supplierId: input.supplierId,
        status: "ORDERED",
        expectedAt: input.expectedAt ? new Date(input.expectedAt) : undefined,
        totalCost,
        items: {
          createMany: {
            data: input.items.map((item) => ({
              productId: item.productId,
              quantityOrdered: item.quantityOrdered,
              unitCost: item.unitCost,
            })),
          },
        },
      },
      include: { items: true },
    });

    await tx.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "PURCHASE_ORDER_CREATED",
        entityType: "Purchase",
        entityId: created.id,
        newValue: { supplierId: input.supplierId, totalCost: totalCost.toString() },
      },
    });

    return created;
  });

  return NextResponse.json({ purchase }, { status: 201 });
}
