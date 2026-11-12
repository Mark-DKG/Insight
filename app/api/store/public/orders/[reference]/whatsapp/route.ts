import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/store/cart";
import { currentShopper } from "@/lib/store/shopper";

// POST ?t=<token> — the customer tapped "Send on WhatsApp". This records only
// that the link was opened; Insight cannot know whether the message was sent.
export async function POST(request: Request, { params }: { params: { reference: string } }) {
  const t = new URL(request.url).searchParams.get("t");
  if (t && t.length > 100) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const shopper = await currentShopper().catch(() => null);
  if (!t && !shopper) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const reference = params.reference.toUpperCase();
  const order = await prisma.storeOrder.findFirst({
    where: { reference, ...(t ? { lookupTokenHash: hashToken(t) } : { shopperId: shopper!.id }) },
    select: { id: true, whatsappOpenedAt: true },
  });
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!order.whatsappOpenedAt) {
    await prisma.$transaction([
      prisma.storeOrder.update({ where: { id: order.id }, data: { whatsappOpenedAt: new Date() } }),
      prisma.storeOrderEvent.create({ data: { orderId: order.id, actorType: "CUSTOMER", action: "WHATSAPP_LINK_OPENED", note: "Customer opened the WhatsApp link. Delivery of the message is not confirmed." } }),
    ]);
  }
  return NextResponse.json({ ok: true });
}
