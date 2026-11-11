import type { Prisma } from "@prisma/client";

// Shared shapes for listings. The marketplace price falls back to the
// product's selling price when the seller has not set a store price.
export function effectivePrice(listing: { price: Prisma.Decimal | null }, product: { sellingPrice: Prisma.Decimal }): number {
  return Number(listing.price ?? product.sellingPrice);
}

export const sellerListingInclude = {
  product: { select: { id: true, name: true, sku: true, sellingPrice: true, isActive: true, unit: true, imageUrl: true } },
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { id: true, sortOrder: true, mimeType: true, sizeBytes: true }, orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.StoreListingInclude;

/** Public listing visibility rule, used by every public query. */
export const PUBLIC_LISTING_WHERE = {
  status: "PUBLISHED",
  isVisible: true,
  product: { isActive: true },
  business: {
    status: "ACTIVE",
    appMode: { in: ["FULL", "STORE_INVENTORY"] },
    storeSeller: { is: { status: "ACTIVE" } },
  },
} satisfies Prisma.StoreListingWhereInput;
