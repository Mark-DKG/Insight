import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { notifyBusiness } from "@/lib/notify";

const Schema = z.object({ action: z.enum(["hide", "unhide", "dismiss_reports"]), reason: z.string().trim().max(1000).optional() });

// POST — moderate a review. Hiding needs a reason and is audited; the review
// stops counting toward ratings immediately.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { action } = parsed.data;
  const reason = parsed.data.reason ?? "";
  const review = await prisma.storeReview.findUnique({ where: { id: params.id }, include: { listing: { select: { title: true } } } });
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  if (action === "hide" && reason.length < 5) return NextResponse.json({ error: "Give a reason (at least 5 characters)." }, { status: 400 });
  if (action === "hide" && review.status === "HIDDEN") return NextResponse.json({ error: "Already hidden." }, { status: 409 });
  if (action === "unhide" && review.status !== "HIDDEN") return NextResponse.json({ error: "This review isn't hidden." }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    if (action === "hide") {
      await tx.storeReview.update({ where: { id: review.id }, data: { status: "HIDDEN", hiddenReason: reason, hiddenAt: new Date(), hiddenByAdminId: ctx.admin.id } });
    } else if (action === "unhide") {
      await tx.storeReview.update({ where: { id: review.id }, data: { status: "VISIBLE", hiddenReason: null, hiddenAt: null, hiddenByAdminId: null } });
    }
    await tx.storeReviewReport.updateMany({ where: { reviewId: review.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    await platformAudit(ctx, {
      action: `STORE_REVIEW_${action.toUpperCase()}`, targetBusinessId: review.businessId, targetType: "StoreReview", targetId: review.id,
      reason: reason || null, before: { status: review.status }, after: { status: action === "hide" ? "HIDDEN" : action === "unhide" ? "VISIBLE" : review.status },
    }, tx);
    if (action === "hide") {
      await notifyBusiness({
        businessId: review.businessId, type: "STORE_LISTING", title: "A review was removed by Insight Store",
        message: `Reason: ${reason}`, link: "/seller?tab=reviews", dedupeKey: `review:${review.id}:hidden:${Date.now()}`,
      }, tx);
    }
  });
  return NextResponse.json({ ok: true });
}
