import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/tenant";
import { requireSeller, actorLabel } from "@/lib/store/server";
import { applyOrderAction, OrderActionError } from "@/lib/store/orders";
import { checkStockAlerts } from "@/lib/notify";

const Schema = z.object({
  action: z.enum(["confirm", "reject", "awaiting_payment", "record_payment", "processing", "ready", "dispatch", "complete", "cancel", "record_refund"]),
  note: z.string().max(1000).optional().nullable(),
});

// POST /api/seller/orders/[id]/action { action, note? }
// Status changes follow the order state machine (lib/store/core.ts); the
// seller records what happened outside Insight (WhatsApp, payment) — nothing
// here assumes a message was sent or money received.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    const result = await applyOrderAction({
      orderId: params.id, businessId: g.session.businessId, action: parsed.data.action, note: parsed.data.note,
      actor: { type: "BUSINESS_USER", id: g.session.sub, userId: g.session.sub, label: await actorLabel(g.session) },
    });
    if ("stockChanged" in result && result.stockChanged && result.productIds) {
      await checkStockAlerts(g.session.businessId, result.productIds).catch((e) => console.error("Stock alert check failed:", e));
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OrderActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Order action failed:", e);
    return NextResponse.json({ error: "The order could not be updated. Nothing was changed." }, { status: 500 });
  }
}
