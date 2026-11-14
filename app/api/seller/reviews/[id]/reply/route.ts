import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requireSeller } from "@/lib/store/server";
import { cleanText, MAX_REPLY } from "@/lib/store/reviews-core";

const Body = z.object({ reply: z.string().max(5000).nullable() });

// POST { reply } — public reply to a review of this seller; { reply: null } removes it.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const review = await prisma.storeReview.findFirst({ where: { id: params.id, businessId: g.session.businessId, status: "VISIBLE" } });
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  const text = parsed.data.reply === null ? { value: null } : cleanText(parsed.data.reply, MAX_REPLY, "Reply");
  if (text.error) return NextResponse.json({ error: text.error }, { status: 400 });
  if (parsed.data.reply !== null && !text.value) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
  await prisma.$transaction([
    prisma.storeReview.update({ where: { id: review.id }, data: { sellerReply: text.value, sellerRepliedAt: text.value ? new Date() : null } }),
    prisma.auditLog.create({ data: { businessId: g.session.businessId, userId: g.session.sub, branchId: g.session.branchId, action: text.value ? "STORE_REVIEW_REPLIED" : "STORE_REVIEW_REPLY_REMOVED", entityType: "StoreReview", entityId: review.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
