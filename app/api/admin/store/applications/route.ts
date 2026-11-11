import { NextResponse } from "next/server";
import type { Prisma, SellerApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

const STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED", "APPROVED", "REJECTED", "WITHDRAWN"];

// GET /api/admin/store/applications?status=&q=  (drafts are the business's own
// work in progress and are listed only when asked for explicitly)
export async function GET(request: Request) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const u = new URL(request.url).searchParams;
  const status = u.get("status");
  const q = (u.get("q") ?? "").trim();
  const where: Prisma.StoreSellerApplicationWhereInput = {
    ...(status === "PENDING" ? { status: { in: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED"] } } : status && STATUSES.includes(status) ? { status: status as SellerApplicationStatus } : { status: { not: "DRAFT" } }),
    ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { business: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const items = await prisma.storeSellerApplication.findMany({
    where, orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 200,
    select: { id: true, reference: true, status: true, submittedAt: true, decidedAt: true, createdAt: true, requestedAppMode: true, data: true, business: { select: { id: true, name: true, appMode: true } }, _count: { select: { documents: true } } },
  });
  return NextResponse.json({
    applications: items.map(({ data, ...a }) => ({ ...a, city: (data as Record<string, unknown>)?.city ?? null, categories: (data as Record<string, unknown>)?.categories ?? [] })),
  });
}
