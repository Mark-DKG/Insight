import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requireSeller } from "@/lib/store/server";
import { MIN_REPORT_REASON } from "@/lib/store/reviews-core";

const Body = z.object({ reason: z.string().trim().min(MIN_REPORT_REASON, "Tell us briefly what's wrong.").max(500) });

// POST { reason } — ask Insight Store moderators to look at a review.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const review = await prisma.storeReview.findFirst({ where: { id: params.id, businessId: g.session.businessId, status: "VISIBLE" }, select: { id: true } });
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  const key = `business:${g.session.businessId}`;
  await prisma.storeReviewReport.upsert({
    where: { reviewId_reporterKey: { reviewId: review.id, reporterKey: key } },
    create: { reviewId: review.id, reporterKey: key, reporterType: "SELLER", reason: parsed.data.reason }, update: {},
  });
  return NextResponse.json({ ok: true });
}
