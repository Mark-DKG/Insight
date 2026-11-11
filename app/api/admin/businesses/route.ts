import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

// GET /api/admin/businesses?q=&status=&mode=&sort=&dir=&page=&pageSize=
// Global directory. All parameters are validated/whitelisted; user input is
// only ever bound as SQL parameters.

const SORTS: Record<string, string> = {
  created: `b."createdAt"`,
  name: `lower(b.name)`,
  users: `user_count`,
  activity: `last_activity`,
};

export async function GET(request: Request) {
  const ctx = await requireAdmin("businesses.read");
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const status = url.searchParams.get("status");
  const mode = url.searchParams.get("mode");
  const sortKey = SORTS[url.searchParams.get("sort") ?? "created"] ? url.searchParams.get("sort") ?? "created" : "created";
  const dir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 25) || 25));
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);

  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    conditions.push(Prisma.sql`(lower(b.name) LIKE ${like} OR b.id = ${q} OR EXISTS (
      SELECT 1 FROM "User" u2 WHERE u2."businessId" = b.id AND lower(u2.email) LIKE ${like}))`);
  }
  if (status === "ACTIVE" || status === "SUSPENDED") conditions.push(Prisma.sql`b.status = ${status}::"BusinessStatus"`);
  if (mode === "FULL" || mode === "INVENTORY_ONLY") conditions.push(Prisma.sql`b."appMode" = ${mode}::"AppMode"`);
  const where = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<
    {
      id: string; name: string; createdAt: Date; status: string; appMode: string; currency: string;
      owner_name: string | null; owner_email: string | null; user_count: bigint; branch_count: bigint;
      last_activity: Date | null;
    }[]
  >`
    SELECT b.id, b.name, b."createdAt", b.status::text AS status, b."appMode"::text AS "appMode", b.currency,
      o.name AS owner_name, o.email AS owner_email,
      (SELECT COUNT(*) FROM "User" u WHERE u."businessId" = b.id) AS user_count,
      (SELECT COUNT(*) FROM "Branch" br WHERE br."businessId" = b.id) AS branch_count,
      GREATEST(
        (SELECT MAX(u."lastLoginAt") FROM "User" u WHERE u."businessId" = b.id),
        (SELECT MAX(s."createdAt") FROM "Sale" s WHERE s."businessId" = b.id),
        (SELECT MAX(m."createdAt") FROM "InventoryMovement" m WHERE m."businessId" = b.id)
      ) AS last_activity
    FROM "Business" b
    LEFT JOIN LATERAL (
      SELECT name, email FROM "User" u WHERE u."businessId" = b.id AND u.role = 'OWNER' ORDER BY u."createdAt" LIMIT 1
    ) o ON TRUE
    WHERE ${where}
    ORDER BY ${Prisma.raw(SORTS[sortKey])} ${Prisma.raw(dir)} NULLS LAST, b.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

  const totalRows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Business" b WHERE ${where}`;
  const total = Number(totalRows[0]?.n ?? 0);

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id, name: r.name, createdAt: r.createdAt, status: r.status, appMode: r.appMode, currency: r.currency,
      owner: r.owner_email ? { name: r.owner_name, email: r.owner_email } : null,
      userCount: Number(r.user_count), branchCount: Number(r.branch_count), lastActivity: r.last_activity,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
