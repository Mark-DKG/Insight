import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { getStoreConfig } from "@/lib/store/server";

export async function GET() {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const [config, categories] = await Promise.all([
    getStoreConfig(),
    prisma.storeCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { listings: true } } } }),
  ]);
  return NextResponse.json({ config, categories, permissions: ctx.permissions });
}

const Schema = z.object({
  isOpen: z.boolean().optional(),
  announcement: z.string().trim().max(500).nullable().optional(),
  policies: z.string().trim().max(10000).nullable().optional(),
  orderExpiryHours: z.number().int().min(1).max(336).optional(),
  requiredDocuments: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), label: z.string().trim().min(2).max(120), required: z.boolean() })).max(10).optional(),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)."),
});

export async function PATCH(request: Request) {
  const ctx = await requireAdmin("marketplace.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  const { reason, ...data } = parsed.data;
  if (data.announcement === "") data.announcement = null;
  const before = await getStoreConfig();
  const config = await prisma.$transaction(async (tx) => {
    const c = await tx.storeConfig.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
    await platformAudit(ctx, { action: "STORE_CONFIG_UPDATED", targetType: "StoreConfig", targetId: "default", reason, before, after: c }, tx);
    return c;
  });
  return NextResponse.json({ config });
}
