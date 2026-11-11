import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { requireSeller, availabilityFor, actorLabel } from "@/lib/store/server";
import { effectivePrice, sellerListingInclude } from "@/lib/store/listing";

// GET /api/seller/listings            the business's listings with live stock
// GET /api/seller/listings?candidates=1&q=  active products not yet listed
export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "store:read")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const seller = await prisma.storeSeller.findUnique({ where: { businessId: session.businessId } });
  if (!seller) return NextResponse.json({ error: "Your business is not an approved Insight Store seller.", code: "STORE_NOT_AVAILABLE" }, { status: 403 });
  const url = new URL(request.url);

  if (url.searchParams.get("candidates")) {
    const q = (url.searchParams.get("q") ?? "").trim();
    const products = await prisma.product.findMany({
      where: {
        businessId: session.businessId, isActive: true, storeListing: { is: null },
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}),
      },
      select: { id: true, name: true, sku: true, sellingPrice: true, description: true, unit: true },
      orderBy: { name: "asc" },
      take: 50,
    });
    const stock = await availabilityFor(products.map((p) => ({ productId: p.id, businessId: session.businessId })));
    return NextResponse.json({ products: products.map((p) => ({ ...p, sellingPrice: Number(p.sellingPrice), available: stock.get(p.id) ?? 0 })) });
  }

  const listings = await prisma.storeListing.findMany({
    where: { businessId: session.businessId },
    include: sellerListingInclude,
    orderBy: { updatedAt: "desc" },
  });
  const stock = await availabilityFor(listings.map((l) => ({ productId: l.productId, businessId: l.businessId })));
  return NextResponse.json({
    listings: listings.map((l) => ({
      ...l, price: l.price === null ? null : Number(l.price), effectivePrice: effectivePrice(l, l.product),
      product: { ...l.product, sellingPrice: Number(l.product.sellingPrice) }, available: stock.get(l.productId) ?? 0,
    })),
  });
}

const Create = z.object({
  productId: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  price: z.number().positive().max(10_000_000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});

// POST /api/seller/listings — list an existing inventory product (draft).
// The listing never holds its own stock; availability always comes from the
// product's inventory at the fulfilment branch.
export async function POST(request: Request) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid listing." }, { status: 400 });
  const d = parsed.data;

  const product = await prisma.product.findFirst({ where: { id: d.productId, businessId: g.session.businessId } });
  if (!product) return NextResponse.json({ error: "Product not found in your inventory." }, { status: 404 });
  if (!product.isActive) return NextResponse.json({ error: "Archived products can't be listed." }, { status: 400 });
  if (d.categoryId && !(await prisma.storeCategory.findFirst({ where: { id: d.categoryId, isActive: true } }))) {
    return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
  }
  try {
    const listing = await prisma.storeListing.create({
      data: {
        businessId: g.session.businessId, productId: product.id, title: d.title ?? product.name,
        description: d.description ?? product.description ?? null, price: d.price ?? null, categoryId: d.categoryId ?? null,
        events: { create: { actorType: "BUSINESS_USER", actorId: g.session.sub, actorLabel: await actorLabel(g.session), action: "CREATED", toStatus: "DRAFT" } },
      },
    });
    return NextResponse.json({ listing: { ...listing, price: listing.price === null ? null : Number(listing.price) } }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "This product already has a listing." }, { status: 409 });
    console.error("Create listing failed:", e);
    return NextResponse.json({ error: "The listing could not be created." }, { status: 500 });
  }
}
