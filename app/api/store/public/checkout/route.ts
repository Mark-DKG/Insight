import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { findCart, cartView, hashToken, REF_COOKIE } from "@/lib/store/cart";
import { uniqueReference, getStoreConfig, fulfilmentBranchId } from "@/lib/store/server";
import { splitBySeller, normalizeWhatsApp, buildWhatsAppMessage, whatsAppLink, cleanChannel } from "@/lib/store/core";
import { notifyBusiness } from "@/lib/notify";

const Schema = z.object({
  idempotencyKey: z.string().min(16).max(80),
  customerName: z.string().trim().min(2, "Enter your name.").max(120),
  customerPhone: z.string().trim().min(6, "Enter a phone number the seller can reach you on.").max(40),
  customerEmail: z.string().trim().email("Enter a valid email or leave it blank.").max(160).optional().or(z.literal("")),
  // Per seller: how the customer wants to receive that seller's items.
  fulfilment: z.record(z.string(), z.enum(["DELIVERY", "COLLECTION"])),
  deliveryAddress: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

function origin() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

// POST /api/store/public/checkout
// Turns the guest cart into one order request per seller. Idempotent on
// idempotencyKey: a retried submit returns the same orders instead of
// creating duplicates. Stock is validated here but only taken from inventory
// when each seller confirms. Nothing here sends a WhatsApp message: it builds
// links the customer opens themselves.
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
  const d = parsed.data;
  const phone = normalizeWhatsApp(d.customerPhone);
  if (!phone) return NextResponse.json({ error: "Enter a valid phone number, e.g. 024 123 4567." }, { status: 400 });

  // Retry of a checkout that already went through.
  // The status-page token is derived from the client's idempotency key, so a
  // retried submit (e.g. after a dropped connection) gets the same links back.
  const token = createHmac("sha256", process.env.JWT_SIGNING_SECRET ?? "insight-store").update(`order-lookup:${d.idempotencyKey}`).digest("base64url");
  const prior = await prisma.storeCheckout.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
  if (prior) return NextResponse.json(await checkoutResult(prior.id, token), { status: 200 });

  const config = await getStoreConfig();
  if (!config.isOpen) return NextResponse.json({ error: config.announcement ?? "Insight Store is not taking orders right now." }, { status: 503 });

  const cart = await findCart();
  const view = await cartView(cart?.id ?? null);
  if (!cart || view.lines.length === 0) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  const problems = view.lines.filter((l) => l.problem);
  if (problems.length) {
    return NextResponse.json({ error: `Please review your cart: ${problems.map((p) => `${p.title} — ${p.problem}`).join(" ")}`, cart: view }, { status: 409 });
  }

  const groups = splitBySeller(view.lines.map((l) => ({ listingId: l.listingId, businessId: l.seller.businessId, sellerName: l.seller.name, title: l.title, unitPrice: l.unitPrice, quantity: l.quantity })));
  for (const g of groups) {
    const s = view.lines.find((l) => l.seller.businessId === g.businessId)!.seller;
    const f = d.fulfilment[g.businessId];
    if (!f) return NextResponse.json({ error: `Choose delivery or collection for ${g.sellerName}.` }, { status: 400 });
    if (f === "DELIVERY" && !s.offersDelivery) return NextResponse.json({ error: `${g.sellerName} doesn't offer delivery. Choose collection.` }, { status: 400 });
    if (f === "COLLECTION" && !s.offersCollection) return NextResponse.json({ error: `${g.sellerName} doesn't offer collection. Choose delivery.` }, { status: 400 });
    if (f === "DELIVERY" && !d.deliveryAddress) return NextResponse.json({ error: "Enter a delivery address." }, { status: 400 });
  }

  const channel = cleanChannel(cookies().get(REF_COOKIE)?.value);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.orderExpiryHours * 3600_000);

  // Product ids + seller details needed for snapshots and WhatsApp links.
  const listingRows = await prisma.storeListing.findMany({
    where: { id: { in: view.lines.map((l) => l.listingId) } },
    select: { id: true, productId: true, product: { select: { sku: true } }, business: { select: { storeSeller: { select: { whatsappNumber: true, fulfilmentBranchId: true } } } } },
  });
  const byListing = new Map(listingRows.map((r) => [r.id, r]));
  const references: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    references.push(await uniqueReference("IS", async (ref) => references.includes(ref) || !!(await prisma.storeOrder.findUnique({ where: { reference: ref } }))));
  }
  const branches = new Map<string, string | null>();
  for (const g of groups) {
    const pref = listingRows.find((r) => view.lines.find((l) => l.listingId === r.id)?.seller.businessId === g.businessId)?.business.storeSeller?.fulfilmentBranchId ?? null;
    branches.set(g.businessId, await fulfilmentBranchId(g.businessId, pref));
  }

  let checkoutId: string;
  try {
    checkoutId = await prisma.$transaction(async (tx) => {
      const checkout = await tx.storeCheckout.create({ data: { idempotencyKey: d.idempotencyKey } });
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const currency = view.lines.find((l) => l.seller.businessId === g.businessId)!.currency;
        const order = await tx.storeOrder.create({
          data: {
            reference: references[i], checkoutId: checkout.id, businessId: g.businessId, branchId: branches.get(g.businessId) ?? null,
            currency, subtotal: g.subtotal, customerName: d.customerName, customerPhone: phone, customerEmail: d.customerEmail || null,
            fulfilment: d.fulfilment[g.businessId], deliveryAddress: d.fulfilment[g.businessId] === "DELIVERY" ? d.deliveryAddress ?? null : null,
            note: d.note || null, lookupTokenHash: tokenHash, expiresAt, attributionChannel: channel, whatsappLinkGeneratedAt: new Date(),
            items: {
              create: g.lines.map((l) => ({
                listingId: l.listingId, productId: byListing.get(l.listingId)!.productId, titleSnapshot: l.title, skuSnapshot: byListing.get(l.listingId)!.product.sku,
                unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.lineTotal,
              })),
            },
            events: { create: { actorType: "CUSTOMER", actorLabel: d.customerName, action: "PLACED", toStatus: "NEW", note: channel ? `Arrived via ${channel}` : null } },
          },
        });
        await notifyBusiness({
          businessId: g.businessId, type: "STORE_ORDER", title: `New Insight Store order ${order.reference}`,
          message: `${d.customerName} requested ${g.lines.reduce((s, l) => s + l.quantity, 0)} item(s), ${currency} ${g.subtotal.toFixed(2)}. Confirm or reject it before ${expiresAt.toLocaleString("en-GB", { timeZone: "Africa/Accra" })}.`,
          link: `/seller?tab=orders&order=${order.id}`, dedupeKey: `order:${order.id}:new`,
        }, tx);
        if (channel) {
          await tx.storeAttributionEvent.create({ data: { channel, event: "ORDER", targetType: "order", targetId: order.id, businessId: g.businessId, orderId: order.id } });
        }
      }
      await tx.storeCartItem.deleteMany({ where: { cartId: cart.id } });
      return checkout.id;
    }, { timeout: 20000, maxWait: 10000 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await prisma.storeCheckout.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
      if (again) return NextResponse.json(await checkoutResult(again.id, token), { status: 200 });
    }
    console.error("Checkout failed:", e);
    return NextResponse.json({ error: "Your order could not be placed. Nothing was charged and your cart is unchanged." }, { status: 500 });
  }

  return NextResponse.json(await checkoutResult(checkoutId, token), { status: 201 });
}

async function checkoutResult(checkoutId: string, token: string) {
  const base = origin();
  const orders = await prisma.storeOrder.findMany({
    where: { checkoutId },
    orderBy: { createdAt: "asc" },
    include: { items: true, business: { select: { name: true, storeSeller: { select: { whatsappNumber: true } } } } },
  });
  return {
    token,
    orders: orders.map((order) => {
      const statusUrl = base ? `${base}/store/orders/${order.reference}?t=${token}` : undefined;
      const wa = order.business.storeSeller?.whatsappNumber ?? null;
      const subtotal = Number(order.subtotal);
      const message = buildWhatsAppMessage({
        reference: order.reference, sellerName: order.business.name, customerName: order.customerName, customerPhone: order.customerPhone,
        customerEmail: order.customerEmail, fulfilment: order.fulfilment, deliveryAddress: order.deliveryAddress, note: order.note, currency: order.currency,
        items: order.items.map((l) => ({ title: l.titleSnapshot, quantity: l.quantity, unitPrice: Number(l.unitPrice), lineTotal: Number(l.lineTotal) })), subtotal, statusUrl,
      });
      return {
        reference: order.reference, sellerName: order.business.name, subtotal, currency: order.currency, fulfilment: order.fulfilment,
        expiresAt: order.expiresAt, whatsappUrl: wa ? whatsAppLink(wa, message) : null, statusPath: `/store/orders/${order.reference}?t=${token}`,
      };
    }),
  };
}
