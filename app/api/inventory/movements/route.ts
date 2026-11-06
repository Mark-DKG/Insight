import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET /api/inventory/movements?limit=50
//
// Every sale (STOCK_OUT) and received purchase (STOCK_IN) already writes an
// InventoryMovement row — this just surfaces that real audit trail, which
// the Inventory screen's Movement History tab was previously showing as a
// hardcoded sample instead of reading.
export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "inventory:read")) {
    return NextResponse.json({ error: "You don't have access to view inventory movements." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? "50"));

  const movements = await prisma.inventoryMovement.findMany({
    where: tenantScope(session),
    include: {
      product: { select: { name: true, unit: true } },
      branch: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // createdById isn't a relation on InventoryMovement, so resolve the
  // handful of distinct user names in one extra query rather than N+1.
  const userIds = Array.from(new Set(movements.map((m) => m.createdById).filter(Boolean))) as string[];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const userNameById = Object.fromEntries(users.map((u) => [u.id, u.name]));

  return NextResponse.json({
    movements: movements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      productName: m.product.name,
      unit: m.product.unit,
      branchName: m.branch.name,
      type: m.type,
      quantity: m.quantity,
      referenceId: m.referenceId,
      userName: m.createdById ? userNameById[m.createdById] ?? "—" : "—",
    })),
  });
}
