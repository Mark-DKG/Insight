import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhook, statusForEvent, shouldAdvance } from "@/lib/email/webhook";
import { alertDeliveryProblem } from "@/lib/email/service";

// POST /api/email/webhook — Resend delivery events (sent, delivered, delayed,
// bounced, complained, failed). Authenticated by signature only. Raw payloads,
// recipient addresses and tokens are never logged.
export async function POST(request: Request) {
  const secret = (process.env.EMAIL_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  const raw = await request.text();
  const ok = verifyWebhook(raw, { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") }, secret);
  if (!ok) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let event: { type?: string; data?: { email_id?: string; bounce?: { message?: string }; reason?: string } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid payload." }, { status: 400 }); }

  const eventId = request.headers.get("svix-id")!;
  const type = String(event.type ?? "");
  const next = statusForEvent(type);

  // Idempotency: a replayed delivery is acknowledged and ignored.
  try {
    await prisma.emailWebhookEvent.create({ data: { id: eventId, type: type.slice(0, 60) } });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ ok: true, duplicate: true });
    throw e;
  }
  if (!next || !event.data?.email_id) return NextResponse.json({ ok: true, ignored: true });

  const msg = await prisma.emailMessage.findUnique({ where: { providerId: event.data.email_id }, select: { id: true, status: true, category: true } });
  if (!msg) return NextResponse.json({ ok: true, unmatched: true });
  if (shouldAdvance(msg.status, next)) {
    const problem = next === "BOUNCED" || next === "COMPLAINED" || next === "FAILED" || next === "SUPPRESSED";
    await prisma.emailMessage.update({
      where: { id: msg.id },
      data: {
        status: next,
        ...(next === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(problem ? { lastError: (event.data.bounce?.message ?? event.data.reason ?? type).toString().slice(0, 300) } : {}),
      },
    });
    if (problem) await alertDeliveryProblem(msg.category, next);
  }
  return NextResponse.json({ ok: true });
}
