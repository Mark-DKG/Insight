import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findCart, getOrCreateCart, cartView, MAX_CART_LINES } from "@/lib/store/cart";
import { PUBLIC_LISTING_WHERE } from "@/lib/store/listing";
import { availabilityFor } from "@/lib/store/server";

export async function GET() {
  const cart = await findCart();
  return NextResponse.json(await cartView(cart?.id ?? null), { headers: { "Cache-Control": "no-store" } });
}

const Line = z.object({ listingId: z.string().min(1).max(60), quantity: z.number().int().min(0).max(999) });

// POST { listingId, quantity }  add to the line (quantity is added)
// PUT  { listingId, quantity }  set the line (0 removes it)
async function change(request: Request, mode: "add" | "set") {
  const parsed = Line.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
  const { listingId, quantity } = parsed.data;
  const cart = await getOrCreateCart();

  if (mode === "set" && quantity === 0) {
    await prisma.storeCartItem.deleteMany({ where: { cartId: cart.id, listingId } });
    return NextResponse.json(await cartView(cart.id));
  }
  const listing = await prisma.storeListing.findFirst({ where: { ...PUBLIC_LISTING_WHERE, id: listingId }, select: { id: true, productId: true, businessId: true } });
  if (!listing) return NextResponse.json({ error: "This item is no longer available." }, { status: 404 });
  const existing = await prisma.storeCartItem.findUnique({ where: { cartId_listingId: { cartId: cart.id, listingId } } });
  if (!existing) {
    const lines = await prisma.storeCartItem.count({ where: { cartId: cart.id } });
    if (lines >= MAX_CART_LINES) return NextResponse.json({ error: `Your cart can hold up to ${MAX_CART_LINES} different items.` }, { status: 400 });
  }
  const next = Math.min(999, mode === "add" ? (existing?.quantity ?? 0) + Math.max(1, quantity) : quantity);
  const available = (await availabilityFor([{ productId: listing.productId, businessId: listing.businessId }])).get(listing.productId) ?? 0;
  if (available <= 0) return NextResponse.json({ error: "This item is out of stock." }, { status: 409 });
  if (next > available) return NextResponse.json({ error: `Only ${available} available.` }, { status: 409 });
  await prisma.storeCartItem.upsert({
    where: { cartId_listingId: { cartId: cart.id, listingId } },
    update: { quantity: next },
    create: { cartId: cart.id, listingId, quantity: next },
  });
  await prisma.storeCart.update({ where: { id: cart.id }, data: { expiresAt: new Date(Date.now() + 30 * 86400_000) } });
  return NextResponse.json(await cartView(cart.id));
}

export const POST = (r: Request) => change(r, "add");
export const PUT = (r: Request) => change(r, "set");
