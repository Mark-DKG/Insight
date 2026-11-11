import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";

// GET /api/reports/profit?from=&to=&branchId=
//
// This is the one place "Gross Profit" and "Net Profit" are computed for
// the Dashboard and Reports screens shown earlier — everywhere else in
// this codebase, those figures are read from here rather than
// recalculated inline, so the two screens can never disagree about how
// profit is defined. The formulas match section 12 exactly:
//   Gross Profit = Selling Revenue − Cost of Goods Sold
//   Net Profit   = Gross Profit − Business Expenses

export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "reports:read")) {
    return NextResponse.json({ error: "You don't have access to view reports." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "finance");
  if (blocked) return blocked;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const branchId = url.searchParams.get("branchId") ?? undefined;

  const dateFilter =
    from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {};

  const sales = await prisma.sale.findMany({
    where: {
      ...tenantScope(session),
      ...(branchId ? { branchId } : {}),
      status: { in: ["COMPLETED"] }, // refunded/voided sales don't count toward profit
      ...dateFilter,
    },
    select: { subtotal: true, discountAmount: true, totalAmount: true, costOfGoods: true, grossProfit: true },
  });

  const expenseDateFilter =
    from || to
      ? {
          incurredAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {};

  const expenses = await prisma.expense.findMany({
    where: { ...tenantScope(session), ...(branchId ? { branchId } : {}), ...expenseDateFilter },
    select: { amount: true },
  });

  const revenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const costOfGoodsSold = sales.reduce((sum, s) => sum + Number(s.costOfGoods), 0);
  const grossProfit = sales.reduce((sum, s) => sum + Number(s.grossProfit), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit = grossProfit - totalExpenses;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  return NextResponse.json({
    revenue,
    costOfGoodsSold,
    grossProfit,
    totalExpenses,
    netProfit,
    netMarginPercent: Number(netMargin.toFixed(2)),
    transactionCount: sales.length,
  });
}
