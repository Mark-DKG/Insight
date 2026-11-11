import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";

const EXPENSE_CATEGORIES = [
  "RENT", "UTILITIES", "TRANSPORT", "SALARIES", "MAINTENANCE", "MARKETING", "INTERNET", "OTHER",
] as const;

export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "expenses:read")) {
    return NextResponse.json({ error: "You don't have access to view expenses." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "expenses");
  if (blocked) return blocked;

  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const expenses = await prisma.expense.findMany({
    where: {
      ...tenantScope(session),
      ...(category ? { category: category as (typeof EXPENSE_CATEGORIES)[number] } : {}),
      ...(from || to
        ? {
            incurredAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: { branch: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { incurredAt: "desc" },
  });

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return NextResponse.json({ expenses, total });
}

const CreateExpenseSchema = z.object({
  branchId: z.string().uuid().optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive("Expense amount must be greater than zero."),
  description: z.string().optional(),
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT", "OTHER"]),
  incurredAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "expenses:write")) {
    return NextResponse.json({ error: "You don't have permission to record expenses." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "expenses");
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = CreateExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid expense." }, { status: 400 });
  }
  const input = parsed.data;

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        businessId: session.businessId,
        branchId: input.branchId,
        createdById: session.sub,
        category: input.category,
        amount: input.amount,
        description: input.description,
        paymentMethod: input.paymentMethod,
        incurredAt: input.incurredAt ? new Date(input.incurredAt) : new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "EXPENSE_CREATED",
        entityType: "Expense",
        entityId: created.id,
        newValue: { category: created.category, amount: created.amount.toString() },
      },
    });

    return created;
  });

  return NextResponse.json({ expense }, { status: 201 });
}
