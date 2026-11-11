import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";

// GET /api/admin/businesses/[id] — full business profile for administrators.
// Financial totals are included only with transactions.read; platform audit
// history only with audit.read.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("businesses.read");
  if (ctx instanceof NextResponse) return ctx;

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, address: true, phone: true, email: true, currency: true, taxRate: true,
      appMode: true, pendingAppMode: true, status: true, suspendedAt: true, suspendedReason: true, createdAt: true, updatedAt: true,
    },
  });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  const canSeeMoney = ctx.permissions.includes("transactions.read");
  const canSeeAudit = ctx.permissions.includes("audit.read");

  const [users, branches, counts, salesAgg, businessAudit, platformAuditRows] = await Promise.all([
    prisma.user.findMany({
      where: { businessId: business.id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, branch: { select: { name: true } } },
    }),
    prisma.branch.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, isMain: true, isActive: true, createdAt: true, _count: { select: { sales: true, inventoryLevels: true } } },
    }),
    Promise.all([
      prisma.product.count({ where: { businessId: business.id, isActive: true } }),
      prisma.customer.count({ where: { businessId: business.id } }),
      prisma.supplier.count({ where: { businessId: business.id } }),
      prisma.purchase.count({ where: { businessId: business.id } }),
      prisma.expense.count({ where: { businessId: business.id } }),
      prisma.inventoryMovement.count({ where: { businessId: business.id } }),
    ]),
    canSeeMoney
      ? prisma.sale.aggregate({ where: { businessId: business.id, status: "COMPLETED" }, _sum: { totalAmount: true, grossProfit: true }, _count: true, _max: { createdAt: true } })
      : Promise.resolve(null),
    canSeeAudit
      ? prisma.auditLog.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 25 })
      : Promise.resolve(null),
    canSeeAudit
      ? prisma.platformAuditLog.findMany({ where: { targetBusinessId: business.id }, orderBy: { createdAt: "desc" }, take: 25 })
      : Promise.resolve(null),
  ]);

  const owner = users.find((u) => u.role === "OWNER") ?? null;
  const [products, customers, suppliers, purchases, expenses, movements] = counts;

  return NextResponse.json({
    business,
    owner,
    users,
    branches,
    counts: { users: users.length, branches: branches.length, products, customers, suppliers, purchases, expenses, inventoryMovements: movements },
    sales: salesAgg
      ? { transactions: salesAgg._count, volume: Number(salesAgg._sum.totalAmount ?? 0), grossProfit: Number(salesAgg._sum.grossProfit ?? 0), lastSaleAt: salesAgg._max.createdAt }
      : null,
    businessAudit,
    platformAudit: platformAuditRows,
    permissions: ctx.permissions,
  });
}

const Patch = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().nullable().optional().or(z.literal("")),
    phone: z.string().trim().max(40).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
    reason: z.string().trim().min(5, "Give a reason (at least 5 characters)."),
  }),
  z.object({ action: z.literal("suspend"), reason: z.string().trim().min(5, "Give a reason (at least 5 characters).") }),
  z.object({ action: z.literal("reactivate"), reason: z.string().trim().min(5, "Give a reason (at least 5 characters).") }),
  z.object({
    action: z.literal("set_mode"),
    mode: z.enum(["FULL", "INVENTORY_ONLY", "STORE_INVENTORY", "POS_INVENTORY"]),
    reason: z.string().trim().min(5, "Give a reason (at least 5 characters)."),
  }),
]);

// PATCH /api/admin/businesses/[id] — edit, suspend, reactivate, or override
// the application mode. Every change is written to the platform audit log
// and to the business's own audit log so its Owner can see it.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("businesses.manage");
  if (ctx instanceof NextResponse) return ctx;

  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const input = parsed.data;

  const before = await prisma.business.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      let data: Record<string, unknown> = {};
      let action = "";
      if (input.action === "update") {
        const { reason: _r, action: _a, email, ...rest } = input;
        data = { ...rest, ...(email !== undefined ? { email: email || null } : {}) };
        action = "BUSINESS_UPDATED";
      } else if (input.action === "suspend") {
        if (before.status === "SUSPENDED") throw new Error("ALREADY:This business is already suspended.");
        data = { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: input.reason };
        action = "BUSINESS_SUSPENDED";
        // Sign everyone out: refresh tokens are revoked now; access tokens
        // expire within 15 minutes and cannot be renewed.
        await tx.refreshToken.updateMany({
          where: { revokedAt: null, user: { businessId: before.id } },
          data: { revokedAt: new Date() },
        });
      } else if (input.action === "reactivate") {
        if (before.status === "ACTIVE") throw new Error("ALREADY:This business is already active.");
        data = { status: "ACTIVE", suspendedAt: null, suspendedReason: null };
        action = "BUSINESS_REACTIVATED";
      } else {
        if (before.appMode === input.mode) throw new Error("ALREADY:The business is already on that package.");
        // An administrator override replaces any package request waiting on
        // seller approval. Store selling still needs an approved seller.
        data = { appMode: input.mode, pendingAppMode: null };
        action = "APP_MODE_OVERRIDDEN";
      }

      const after = await tx.business.update({ where: { id: before.id }, data });

      const pick = (b: typeof before) => ({
        name: b.name, email: b.email, phone: b.phone, address: b.address, status: b.status, appMode: b.appMode,
      });
      await platformAudit(
        ctx,
        { action, targetBusinessId: before.id, targetType: "Business", targetId: before.id, reason: input.reason, before: pick(before), after: pick(after) },
        tx
      );
      await tx.auditLog.create({
        data: {
          businessId: before.id,
          userId: null,
          action: `PLATFORM_${action}`,
          entityType: "Business",
          entityId: before.id,
          previousValue: pick(before),
          newValue: { ...pick(after), byPlatformAdmin: ctx.admin.email, reason: input.reason },
        },
      });
      return after;
    });

    return NextResponse.json({ business: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("ALREADY:")) {
      return NextResponse.json({ error: message.slice(8) }, { status: 409 });
    }
    console.error("Admin business update failed:", error);
    return NextResponse.json({ error: "The change could not be saved. Nothing was modified." }, { status: 500 });
  }
}
