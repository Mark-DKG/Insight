import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET /api/suppliers/[id] — detail plus a same-product price comparison
// against other suppliers in this business, matching section 19's
// "Supplier A: GHS 24 / Supplier B: GHS 21 → Potential saving: GHS 300"
// example. The comparison is computed here rather than in the UI so every
// screen that shows it agrees on the numbers.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "suppliers:read")) {
    return NextResponse.json({ error: "You don't have access to view this supplier." }, { status: 403 });
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, ...tenantScope(session) },
    include: {
      products: { select: { id: true, name: true, costPrice: true, sku: true } },
      purchases: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { items: { include: { product: { select: { name: true } } } } },
      },
    },
  });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  }

  // For each product this supplier sells, find whether a cheaper supplier
  // for the *same product* exists in this business (matched by SKU, since
  // that's the stable identifier — a product row belongs to one supplier
  // in this schema, so "same product, different supplier" means another
  // Product row sharing the SKU under a different supplierId).
  const skus = supplier.products.map((p) => p.sku).filter(Boolean);
  const alternatives = skus.length
    ? await prisma.product.findMany({
        where: { businessId: session.businessId, sku: { in: skus as string[] }, supplierId: { not: supplier.id } },
        select: { sku: true, costPrice: true, supplier: { select: { name: true } } },
      })
    : [];

  const priceComparison = supplier.products
    .map((p) => {
      const cheaperAlt = alternatives
        .filter((a) => a.sku === p.sku && Number(a.costPrice) < Number(p.costPrice))
        .sort((a, b) => Number(a.costPrice) - Number(b.costPrice))[0];
      if (!cheaperAlt) return null;
      return {
        product: p.name,
        currentPrice: p.costPrice,
        alternativeSupplier: cheaperAlt.supplier?.name ?? "Unknown supplier",
        alternativePrice: cheaperAlt.costPrice,
        savingPerUnit: Number(p.costPrice) - Number(cheaperAlt.costPrice),
      };
    })
    .filter(Boolean);

  return NextResponse.json({ supplier, priceComparison });
}

const UpdateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "suppliers:write")) {
    return NextResponse.json({ error: "You don't have permission to edit suppliers." }, { status: 403 });
  }

  const existing = await prisma.supplier.findFirst({ where: { id: params.id, ...tenantScope(session) } });
  if (!existing) {
    return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }

  const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: parsed.data });
  return NextResponse.json({ supplier });
}
