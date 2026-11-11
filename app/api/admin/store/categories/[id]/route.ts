import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";

const Schema = z.object({ name: z.string().trim().min(2).max(60).optional(), sortOrder: z.number().int().min(0).max(999).optional(), isActive: z.boolean().optional() });

// PATCH — rename, reorder or hide a category. Categories are never deleted so
// existing listings keep their classification.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid category." }, { status: 400 });
  const before = await prisma.storeCategory.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: "Category not found." }, { status: 404 });
  const category = await prisma.storeCategory.update({ where: { id: before.id }, data: parsed.data });
  await platformAudit(ctx, { action: "STORE_CATEGORY_UPDATED", targetType: "StoreCategory", targetId: category.id, before, after: category });
  return NextResponse.json({ category });
}
