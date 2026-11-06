import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "suppliers:read")) {
    return NextResponse.json({ error: "You don't have access to view suppliers." }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();

  const suppliers = await prisma.supplier.findMany({
    where: {
      ...tenantScope(session),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    include: {
      products: { select: { id: true, name: true, costPrice: true } },
      _count: { select: { purchases: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ suppliers });
}

const CreateSupplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required."),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "suppliers:write")) {
    return NextResponse.json({ error: "You don't have permission to add suppliers." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid supplier data." }, { status: 400 });
  }

  const supplier = await prisma.supplier.create({
    data: { ...parsed.data, businessId: session.businessId },
  });

  return NextResponse.json({ supplier }, { status: 201 });
}
