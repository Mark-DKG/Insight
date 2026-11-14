import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentShopper } from "@/lib/store/shopper";
import { rateLimited } from "@/lib/rate-limit";
import { MIN_REPORT_REASON, REVIEW_WRITES_PER_HOUR } from "@/lib/store/reviews-core";

export const dynamic = "force-dynamic";
const Body = z.object({ reason: z.string().trim().min(MIN_REPORT_REASON, "Tell us briefly what's wrong.").max(500) });

// POST — a signed-in shopper reports a review (spam, abuse, wrong store).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const shopper = await currentShopper().catch(() => null);
  if (!shopper) return NextResponse.json({ error: "Sign in to report a review." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  if (await rateLimited(`review:${shopper.id}`, REVIEW_WRITES_PER_HOUR, 3600_000)) return NextResponse.json({ error: "You're doing that too often. Try again later." }, { status: 429 });
  const review = await prisma.storeReview.findFirst({ where: { id: params.id, status: "VISIBLE" }, select: { id: true, shopperId: true } });
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  if (review.shopperId === shopper.id) return NextResponse.json({ error: "You can't report your own review." }, { status: 400 });
  await prisma.storeReviewReport.upsert({
    where: { reviewId_reporterKey: { reviewId: review.id, reporterKey: `shopper:${shopper.id}` } },
    create: { reviewId: review.id, reporterKey: `shopper:${shopper.id}`, reporterType: "SHOPPER", reason: parsed.data.reason },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
