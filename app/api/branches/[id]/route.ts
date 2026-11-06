import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

const UpdateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "branches:write")) {
    return NextResponse.json({ error: "Only the business owner can edit branches." }, { status: 403 });
  }

  const existing = await prisma.branch.findFirst({ where: { id: params.id, ...tenantScope(session) } });
  if (!existing) {
    return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }

  if (parsed.data.isActive === false && existing.isMain) {
    return NextResponse.json({ error: "The main branch can't be deactivated." }, { status: 400 });
  }

  const branch = await prisma.branch.update({ where: { id: existing.id }, data: parsed.data });
  return NextResponse.json({ branch });
}

// GET /api/branches/[id] — a consolidated snapshot for the branch-comparison
// view (section 28's "drill down into individual branches").
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const branch = await prisma.branch.findFirst({ where: { id: params.id, ...tenantScope(session) } });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  }

  const [salesAgg, expensesAgg, inventoryLevels] = await Promise.all([
    prisma.sale.aggregate({
      where: { branchId: branch.id, status: "COMPLETED" },
      _sum: { totalAmount: true, grossProfit: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { branchId: branch.id },
      _sum: { amount: true },
    }),
    // Prisma can't compare quantity to the related product's minStockLevel
    // in a `where` clause, so pull the (branch-scoped, so small) set of
    // levels with their product's threshold and filter in application code.
    prisma.inventoryLevel.findMany({
      where: { branchId: branch.id },
      select: { quantity: true, product: { select: { minStockLevel: true } } },
    }),
  ]);

  const revenue = Number(salesAgg._sum.totalAmount ?? 0);
  const grossProfit = Number(salesAgg._sum.grossProfit ?? 0);
  const expenses = Number(expensesAgg._sum.amount ?? 0);
  const lowStockCount = inventoryLevels.filter(
    (l) => l.quantity > 0 && l.quantity <= l.product.minStockLevel
  ).length;
  const outOfStockCount = inventoryLevels.filter((l) => l.quantity === 0).length;

  return NextResponse.json({
    branch,
    summary: {
      revenue,
      grossProfit,
      netProfit: grossProfit - expenses,
      transactionCount: salesAgg._count,
      expenses,
      lowStockCount,
      outOfStockCount,
    },
  });
}
