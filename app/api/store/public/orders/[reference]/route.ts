import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { customerOrder } from "@/lib/store/lookup";
import { currentShopper } from "@/lib/store/shopper";

// GET /api/store/public/orders/[reference]?t=<token>
// Without the token from the order confirmation the order is not found, so
// references can't be enumerated.
export async function GET(request: Request, { params }: { params: { reference: string } }) {
  const t = new URL(request.url).searchParams.get("t");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  const shopper = await currentShopper().catch(() => null);
  const order = await customerOrder(params.reference, t, origin, shopper?.id ?? null);
  if (!order) return NextResponse.json({ error: "Order not found. Use the link from your order confirmation." }, { status: 404 });
  return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
}
