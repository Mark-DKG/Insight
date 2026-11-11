import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { slugify } from "@/lib/store/core";

const Schema = z.object({ name: z.string().trim().min(2).max(60), sortOrder: z.number().int().min(0).max(999).optional() });

export async function POST(request: Request) {
  const ctx = await requireAdmin("marketplace.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid category." }, { status: 400 });
  const slug = slugify(parsed.data.name);
  if (await prisma.storeCategory.findUnique({ where: { slug } })) return NextResponse.json({ error: "A category with that name already exists." }, { status: 409 });
  const category = await prisma.storeCategory.create({ data: { name: parsed.data.name, slug, sortOrder: parsed.data.sortOrder ?? 100 } });
  await platformAudit(ctx, { action: "STORE_CATEGORY_CREATED", targetType: "StoreCategory", targetId: category.id, after: category });
  return NextResponse.json({ category }, { status: 201 });
}
