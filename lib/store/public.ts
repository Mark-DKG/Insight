import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { availabilityFor } from "./server";
import { PUBLIC_LISTING_WHERE } from "./listing";

// Read-only queries behind the public marketplace. Everything here returns
// only public-safe fields: no costs, no internal stock figures beyond a
// coarse availability, no seller documents, no customer data.

export type PublicListing = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  imageIds: string[];
  fallbackImageUrl: string | null;
  category: { name: string; slug: string } | null;
  available: number;
  isFeatured: boolean;
  publishedAt: string | null;
  seller: { name: string; slug: string; city: string | null; region: string | null; offersDelivery: boolean; offersCollection: boolean };
};

const listingSelect = {
  id: true, title: true, description: true, price: true, isFeatured: true, publishedAt: true, productId: true, businessId: true,
  product: { select: { sellingPrice: true, imageUrl: true } },
  category: { select: { name: true, slug: true } },
  images: { select: { id: true }, orderBy: { sortOrder: "asc" as const } },
  business: { select: { name: true, currency: true, storeSeller: { select: { slug: true, city: true, region: true, offersDelivery: true, offersCollection: true } } } },
} satisfies Prisma.StoreListingSelect;

type Row = Prisma.StoreListingGetPayload<{ select: typeof listingSelect }>;

async function toPublic(rows: Row[]): Promise<PublicListing[]> {
  const stock = await availabilityFor(rows.map((r) => ({ productId: r.productId, businessId: r.businessId })));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    price: Number(r.price ?? r.product.sellingPrice),
    currency: r.business.currency,
    imageIds: r.images.map((i) => i.id),
    fallbackImageUrl: r.product.imageUrl && /^https:\/\//.test(r.product.imageUrl) ? r.product.imageUrl : null,
    category: r.category,
    available: stock.get(r.productId) ?? 0,
    isFeatured: r.isFeatured,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    seller: {
      name: r.business.name, slug: r.business.storeSeller?.slug ?? "", city: r.business.storeSeller?.city ?? null, region: r.business.storeSeller?.region ?? null,
      offersDelivery: !!r.business.storeSeller?.offersDelivery, offersCollection: !!r.business.storeSeller?.offersCollection,
    },
  }));
}

export async function storeIsOpen() {
  const cfg = await prisma.storeConfig.findUnique({ where: { id: "default" }, select: { isOpen: true, announcement: true } });
  return { isOpen: cfg?.isOpen ?? true, announcement: cfg?.announcement ?? null };
}

export async function publicCategories() {
  return prisma.storeCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true } });
}

export type CatalogQuery = { q?: string; category?: string; seller?: string; sort?: string; inStock?: boolean; minPrice?: number; maxPrice?: number; page?: number; pageSize?: number };

// Text, category and seller filters run in the database; price and stock
// filters and price sorting run on the (bounded) matching set because the
// effective price and availability are derived values.
const SCAN_LIMIT = 600;

export async function searchCatalog(query: CatalogQuery) {
  const q = query.q?.trim().slice(0, 100);
  const where: Prisma.StoreListingWhereInput = {
    ...PUBLIC_LISTING_WHERE,
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.seller ? { business: { ...PUBLIC_LISTING_WHERE.business, storeSeller: { is: { status: "ACTIVE", slug: query.seller } } } } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { business: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const rows = await prisma.storeListing.findMany({
    where, select: listingSelect, take: SCAN_LIMIT,
    orderBy: query.sort === "oldest" ? { publishedAt: "asc" } : [{ isFeatured: "desc" }, { publishedAt: "desc" }],
  });
  let items = await toPublic(rows);
  if (query.inStock) items = items.filter((i) => i.available > 0);
  if (query.minPrice !== undefined) items = items.filter((i) => i.price >= query.minPrice!);
  if (query.maxPrice !== undefined) items = items.filter((i) => i.price <= query.maxPrice!);
  if (query.sort === "price_asc") items.sort((a, b) => a.price - b.price);
  if (query.sort === "price_desc") items.sort((a, b) => b.price - a.price);
  if (query.sort === "newest") items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const pageSize = Math.min(48, Math.max(1, query.pageSize ?? 24));
  const page = Math.max(1, query.page ?? 1);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, truncated: rows.length === SCAN_LIMIT };
}

export async function featuredListings(limit = 8) {
  const rows = await prisma.storeListing.findMany({ where: PUBLIC_LISTING_WHERE, select: listingSelect, orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: limit });
  return toPublic(rows);
}

export async function publicListing(id: string) {
  const row = await prisma.storeListing.findFirst({ where: { ...PUBLIC_LISTING_WHERE, id }, select: listingSelect });
  if (!row) return null;
  return (await toPublic([row]))[0];
}

export async function featuredSellers(limit = 8) {
  return prisma.storeSeller.findMany({
    where: { status: "ACTIVE", business: { status: "ACTIVE", appMode: { in: ["FULL", "STORE_INVENTORY"] } }, isFeatured: true },
    select: { slug: true, city: true, region: true, description: true, business: { select: { name: true } } },
    take: limit,
    orderBy: { approvedAt: "desc" },
  });
}

export async function publicSeller(slug: string) {
  const s = await prisma.storeSeller.findFirst({
    where: { slug, status: "ACTIVE", business: { status: "ACTIVE", appMode: { in: ["FULL", "STORE_INVENTORY"] } } },
    select: {
      slug: true, description: true, city: true, region: true, country: true, publicPhone: true, publicEmail: true, openingHours: true,
      offersDelivery: true, deliveryInfo: true, offersCollection: true, collectionInfo: true, whatsappNumber: true, approvedAt: true,
      business: { select: { name: true } },
    },
  });
  return s;
}
