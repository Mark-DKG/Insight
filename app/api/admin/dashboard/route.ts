import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

// GET /api/admin/dashboard?days=30&granularity=day|week|month|year
// Platform overview computed from live database records. Customer sales are
// reported per currency as "sales volume" — they are the businesses' takings,
// not 9DEVs revenue (no billing data exists yet).

const GRANULARITIES = ["day", "week", "month", "year"] as const;

export async function GET(request: Request) {
  const ctx = await requireAdmin("businesses.read");
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(request.url);
  const days = Math.min(3650, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  const g = url.searchParams.get("granularity");
  const granularity = (GRANULARITIES as readonly string[]).includes(g ?? "") ? (g as (typeof GRANULARITIES)[number]) : days > 120 ? "month" : "day";
  const since = new Date(Date.now() - days * 86_400_000);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const canSeeMoney = ctx.permissions.includes("transactions.read");

  const dbStart = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbLatencyMs = Date.now() - dbStart;

  const [
    businessTotal, businessSuspended, businessInventoryOnly, businessNew, branchTotal,
    userTotal, userInactive, userNew, activeSessions, recentLogins,
    productTotal, customerTotal, supplierTotal,
    recentBusinesses, adminLoginFailures24h, userLoginFailures24h, syncByStatus, dbSize,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { status: "SUSPENDED" } }),
    prisma.business.count({ where: { appMode: "INVENTORY_ONLY" } }),
    prisma.business.count({ where: { createdAt: { gte: since } } }),
    prisma.branch.count(),
    prisma.user.count(),
    prisma.user.count({ where: { isActive: false } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: dayAgo } } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, createdAt: true, status: true, appMode: true, users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 } },
    }),
    prisma.platformAuditLog.count({ where: { action: "ADMIN_LOGIN_FAILED", createdAt: { gte: dayAgo } } }),
    prisma.auditLog.count({ where: { action: "LOGIN_FAILED", createdAt: { gte: dayAgo } } }),
    prisma.syncRecord.groupBy({ by: ["status"], _count: true }),
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
  ]);

  const trunc = Prisma.raw(`'${granularity}'`);
  const [registrationTrend, userTrend, salesTrend, salesByCurrency] = await Promise.all([
    prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc(${trunc}, "createdAt") AS bucket, COUNT(*) AS count
      FROM "Business" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc(${trunc}, "createdAt") AS bucket, COUNT(*) AS count
      FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc(${trunc}, "createdAt") AS bucket, COUNT(*) AS count
      FROM "Sale" WHERE "createdAt" >= ${since} AND status = 'COMPLETED' GROUP BY 1 ORDER BY 1`,
    canSeeMoney
      ? prisma.$queryRaw<{ currency: string; volume: Prisma.Decimal; transactions: bigint }[]>`
          SELECT b.currency, COALESCE(SUM(s."totalAmount"), 0) AS volume, COUNT(s.id) AS transactions
          FROM "Sale" s JOIN "Business" b ON b.id = s."businessId"
          WHERE s."createdAt" >= ${since} AND s.status = 'COMPLETED'
          GROUP BY b.currency ORDER BY volume DESC`
      : Promise.resolve([]),
  ]);

  const toSeries = (rows: { bucket: Date; count: bigint }[]) => rows.map((r) => ({ bucket: r.bucket, count: Number(r.count) }));
  const transactionsInRange = salesTrend.reduce((n, r) => n + Number(r.count), 0);

  const alerts: { severity: "info" | "warning" | "critical"; message: string }[] = [];
  if (businessSuspended > 0) alerts.push({ severity: "info", message: `${businessSuspended} business${businessSuspended === 1 ? " is" : "es are"} suspended.` });
  if (adminLoginFailures24h >= 5) alerts.push({ severity: "warning", message: `${adminLoginFailures24h} failed administrator sign-ins in the last 24 hours.` });
  if (userLoginFailures24h >= 20) alerts.push({ severity: "warning", message: `${userLoginFailures24h} failed business sign-ins in the last 24 hours.` });
  if (dbLatencyMs > 1000) alerts.push({ severity: "warning", message: `Database responded slowly (${dbLatencyMs} ms).` });

  return NextResponse.json({
    range: { days, granularity, since },
    businesses: {
      total: businessTotal,
      active: businessTotal - businessSuspended,
      suspended: businessSuspended,
      full: businessTotal - businessInventoryOnly,
      inventoryOnly: businessInventoryOnly,
      newInRange: businessNew,
      branches: branchTotal,
    },
    users: {
      total: userTotal,
      active: userTotal - userInactive,
      suspended: userInactive,
      newInRange: userNew,
      activeSessions,
      loggedInLast24h: recentLogins,
    },
    activity: {
      transactionsInRange,
      salesVolumeByCurrency: canSeeMoney
        ? salesByCurrency.map((r) => ({ currency: r.currency, volume: Number(r.volume), transactions: Number(r.transactions) }))
        : null,
      activeProducts: productTotal,
      customers: customerTotal,
      suppliers: supplierTotal,
    },
    trends: {
      businessRegistrations: toSeries(registrationTrend),
      userRegistrations: toSeries(userTrend),
      transactions: toSeries(salesTrend),
    },
    infrastructure: {
      api: { status: "ok" },
      database: { status: dbLatencyMs > 1000 ? "slow" : "ok", latencyMs: dbLatencyMs, sizeBytes: Number(dbSize[0]?.bytes ?? 0) },
      authentication: { adminLoginFailures24h, businessLoginFailures24h: userLoginFailures24h },
      synchronization: {
        serverRecords: Object.fromEntries(syncByStatus.map((r) => [r.status, r._count])),
        note: "Offline sales queue on each device; this shows only what has reached the server.",
      },
      backgroundJobs: { status: "none", note: "Insight has no scheduled or background jobs." },
      errorRate: { status: "not_instrumented", note: "HTTP error rates are in Vercel's logs; not yet collected here." },
    },
    recentBusinesses: recentBusinesses.map((b) => ({
      id: b.id, name: b.name, createdAt: b.createdAt, status: b.status, appMode: b.appMode,
      owner: b.users[0] ?? null,
    })),
    alerts,
  });
}
