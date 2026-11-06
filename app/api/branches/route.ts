import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const branches = await prisma.branch.findMany({
    where: tenantScope(session),
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ branches });
}

const CreateBranchSchema = z.object({
  name: z.string().min(1, "Branch name is required."),
  address: z.string().optional(),
  phone: z.string().optional(),
});

// Creating a branch is deliberately restricted to "branches:write" — in the
// RBAC table that's OWNER only, since opening a new location is a
// structural business decision, not routine day-to-day management.
export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "branches:write")) {
    return NextResponse.json({ error: "Only the business owner can add a branch." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid branch data." }, { status: 400 });
  }

  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.branch.create({ data: { ...parsed.data, businessId: session.businessId } });

    // New branch starts with a zero-quantity inventory row for every
    // existing product, mirroring how a new product gets a row per branch
    // in the products route — stock lookups never need to special-case a
    // missing row.
    const products = await tx.product.findMany({ where: { businessId: session.businessId }, select: { id: true } });
    if (products.length > 0) {
      await tx.inventoryLevel.createMany({
        data: products.map((p) => ({ productId: p.id, branchId: created.id, quantity: 0 })),
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "BRANCH_CREATED",
        entityType: "Branch",
        entityId: created.id,
        newValue: { name: created.name },
      },
    });

    return created;
  });

  return NextResponse.json({ branch }, { status: 201 });
}
