import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { processOutbox } from "@/lib/email/service";
import { prisma } from "@/lib/prisma";
import { sendDailySalesSummaries } from "@/lib/email/events";

// GET /api/cron/email — retries queued emails that are due. Vercel Cron sends
// "Authorization: Bearer $CRON_SECRET". Without CRON_SECRET set it refuses.
export async function GET(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const summaries = await sendDailySalesSummaries().catch(() => ({ businesses: 0 }));
  const result = { ...(await processOutbox(25)), summaries: summaries.businesses };
  // Housekeeping: webhook ids older than 30 days and delivery rows older than 180 days are removed.
  await prisma.emailWebhookEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400_000) } } }).catch(() => null);
  await prisma.emailMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86400_000) } } }).catch(() => null);
  return NextResponse.json(result);
}
