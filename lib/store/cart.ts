import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "./listing";
import { availabilityFor } from "./server";

// Guest carts: a random token in an httpOnly cookie; only its SHA-256 hash
// is stored, so a database leak can't be replayed as someone's cart.
export const CART_COOKIE = "insight_store_cart";
export const REF_COOKIE = "insight_store_ref";
const CART_DAYS = 30;
export const MAX_CART_LINES = 30;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

export async function findCart() {
  const token = cookies().get(CART_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const cart = await prisma.storeCart.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!cart || cart.expiresAt < new Date()) return null;
  return cart;
}

export async function getOrCreateCart() {
  const existing = await findCart();
  if (existing) return existing;
  const token = newToken();
  const cart = await prisma.storeCart.create({ data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + CART_DAYS * 86400_000) } });
  cookies().set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CART_DAYS * 86400 });
  return cart;
}

/** The cart with live price/availability per line; unavailable lines are flagged, not silently dropped. */
export async function cartView(cartId: string | null) {
  if (!cartId) return { lines: [], count: 0 };
  const items = await prisma.storeCartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: "asc" },
    include: {
      listing: {
        select: {
          id: true, title: true, price: true, status: true, isVisible: true, productId: true, businessId: true,
          product: { select: { sellingPrice: true, isActive: true, imageUrl: true } },
          images: { select: { id: true }, orderBy: { sortOrder: "asc" }, take: 1 },
          business: { select: { name: true, currency: true, status: true, appMode: true, storeSeller: { select: { slug: true, status: true, offersDelivery: true, offersCollection: true, whatsappNumber: true } } } },
        },
      },
    },
  });
  const publicIds = new Set(
    (await prisma.storeListing.findMany({ where: { ...PUBLIC_LISTING_WHERE, id: { in: items.map((i) => i.listingId) } }, select: { id: true } })).map((l) => l.id)
  );
  const stock = await availabilityFor(items.map((i) => ({ productId: i.listing.productId, businessId: i.listing.businessId })));
  const lines = items.map((i) => {
    const l = i.listing;
    const available = stock.get(l.productId) ?? 0;
    const unitPrice = Number(l.price ?? l.product.sellingPrice);
    const isPublic = publicIds.has(l.id);
    return {
      listingId: l.id, title: l.title, quantity: i.quantity, unitPrice, lineTotal: Math.round(unitPrice * i.quantity * 100) / 100,
      currency: l.business.currency, imageId: l.images[0]?.id ?? null, available,
      problem: !isPublic ? "This item is no longer available on Insight Store." : available <= 0 ? "Out of stock." : available < i.quantity ? `Only ${available} available.` : null,
      seller: {
        businessId: l.businessId, name: l.business.name, slug: l.business.storeSeller?.slug ?? "",
        offersDelivery: !!l.business.storeSeller?.offersDelivery, offersCollection: !!l.business.storeSeller?.offersCollection,
        hasWhatsApp: !!l.business.storeSeller?.whatsappNumber,
      },
    };
  });
  return { lines, count: lines.reduce((s, l) => s + l.quantity, 0) };
}
