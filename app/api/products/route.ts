import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET /api/products?search=&categoryId=&status=low|out&page=&pageSize=
export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "products:read")) {
    return NextResponse.json({ error: "You don't have access to view products." }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const categoryId = url.searchParams.get("categoryId") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "25")));

  const where = {
    ...tenantScope(session),
    isActive: true,
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
            { barcode: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: { category: true, supplier: true, inventoryLevels: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

const CreateProductSchema = z.object({
  name: z.string().min(1, "Product name is required."),
  sku: z.string().min(1, "SKU is required."),
  barcode: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  description: z.string().optional(),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  minStockLevel: z.number().int().nonnegative().default(0),
  maxStockLevel: z.number().int().positive().optional(),
  unit: z.string().default("Unit"),
  taxable: z.boolean().default(true),
});

// POST /api/products
export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "products:write")) {
    return NextResponse.json({ error: "You don't have permission to add products." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid product data." }, { status: 400 });
  }

  const data = parsed.data;

  const duplicate = await prisma.product.findFirst({
    where: {
      businessId: session.businessId,
      OR: [{ sku: data.sku }, ...(data.barcode ? [{ barcode: data.barcode }] : [])],
    },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "A product with this SKU or barcode already exists." },
      { status: 409 }
    );
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: { ...data, businessId: session.businessId },
    });

    // Seed a zero-quantity inventory level in every branch so stock lookups
    // never have to special-case "no row yet" for a brand-new product.
    const branches = await tx.branch.findMany({ where: { businessId: session.businessId } });
    if (branches.length > 0) {
      await tx.inventoryLevel.createMany({
        data: branches.map((b) => ({ productId: created.id, branchId: b.id, quantity: 0 })),
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: created.id,
        newValue: { name: created.name, sku: created.sku },
      },
    });

    return created;
  });

  return NextResponse.json({ product }, { status: 201 });
}
