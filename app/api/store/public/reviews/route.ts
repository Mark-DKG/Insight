import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentShopper } from "@/lib/store/shopper";
import { PUBLIC_LISTING_WHERE } from "@/lib/store/listing";
import { rateLimited } from "@/lib/rate-limit";
import { cleanText, dedupeKey, displayNameFor, parseRating, MAX_COMMENT, REVIEW_PAGE_SIZE, REVIEW_WRITES_PER_HOUR } from "@/lib/store/reviews-core";
import { productEligibility, publicReview, reviewSummary, storeEligibility } from "@/lib/store/reviews";
import { notifyBusiness } from "@/lib/notify";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

async function resolveTarget(listingId: string | null, sellerSlug: string | null) {
  if (listingId) {
    const l = await prisma.storeListing.findFirst({ where: { ...PUBLIC_LISTING_WHERE, id: listingId }, select: { id: true, title: true, businessId: true } });
    return l ? { kind: "PRODUCT" as const, businessId: l.businessId, listingId: l.id, label: l.title } : null;
  }
  if (sellerSlug) {
    const s = await prisma.storeSeller.findFirst({ where: { slug: sellerSlug, status: "ACTIVE", business: { status: "ACTIVE" } }, select: { businessId: true, business: { select: { name: true } } } });
    return s ? { kind: "STORE" as const, businessId: s.businessId, listingId: null, label: s.business.name } : null;
  }
  return null;
}

// GET /api/store/public/reviews?listingId=… | ?seller=slug&page=1
// Public: the summary and the visible reviews. Also tells the caller whether
// they can review (signed in + a completed order) and returns their own review.
export async function GET(request: Request) {
  const u = new URL(request.url).searchParams;
  const target = await resolveTarget(u.get("listingId")?.slice(0, 64) ?? null, u.get("seller")?.slice(0, 80) ?? null);
  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const page = Math.max(1, Math.min(500, Number(u.get("page")) || 1));
  const where = { kind: target.kind, businessId: target.businessId, ...(target.listingId ? { listingId: target.listingId } : {}), status: "VISIBLE" } as const;
  const [rows, summary, shopper] = await Promise.all([
    prisma.storeReview.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * REVIEW_PAGE_SIZE, take: REVIEW_PAGE_SIZE }),
    reviewSummary({ kind: target.kind, businessId: target.businessId, listingId: target.listingId ?? undefined }),
    currentShopper().catch(() => null),
  ]);
  let viewer: { signedIn: boolean; canReview: boolean; reason: string | null; mine: ReturnType<typeof mineShape> | null } = { signedIn: false, canReview: false, reason: "Sign in to your Insight Store account to leave a review.", mine: null };
  if (shopper) {
    const elig = target.listingId ? await productEligibility(shopper.id, target.listingId) : await storeEligibility(shopper.id, target.businessId);
    const mine = await prisma.storeReview.findUnique({ where: { dedupeKey: dedupeKey(target.kind, shopper.id, target.listingId ?? target.businessId) } });
    viewer = { signedIn: true, canReview: elig.canReview || !!mine, reason: elig.canReview || mine ? null : elig.reason, mine: mine ? mineShape(mine) : null };
  }
  return NextResponse.json({ summary, reviews: rows.map(publicReview), page, pageSize: REVIEW_PAGE_SIZE, viewer }, { headers: NO_STORE });
}

function mineShape(r: { id: string; rating: number; comment: string | null; status: string }) {
  return { id: r.id, rating: r.rating, comment: r.comment, status: r.status };
}

const Body = z.object({ listingId: z.string().max(64).optional(), seller: z.string().max(80).optional(), rating: z.unknown(), comment: z.unknown().optional() });

// POST — create or update the signed-in shopper's review.
export async function POST(request: Request) {
  const shopper = await currentShopper().catch(() => null);
  if (!shopper) return NextResponse.json({ error: "Sign in to your Insight Store account to leave a review. Guests can't review.", code: "SIGN_IN" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const rating = parseRating(parsed.data.rating);
  if (!rating) return NextResponse.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });
  const comment = cleanText(parsed.data.comment, MAX_COMMENT);
  if (comment.error) return NextResponse.json({ error: comment.error }, { status: 400 });
  const target = await resolveTarget(parsed.data.listingId ?? null, parsed.data.seller ?? null);
  if (!target) return NextResponse.json({ error: "That product or store is not available." }, { status: 404 });
  if (await rateLimited(`review:${shopper.id}`, REVIEW_WRITES_PER_HOUR, 3600_000)) return NextResponse.json({ error: "You're doing that too often. Try again later." }, { status: 429 });

  const key = dedupeKey(target.kind, shopper.id, target.listingId ?? target.businessId);
  const existing = await prisma.storeReview.findUnique({ where: { dedupeKey: key } });
  if (existing?.status === "HIDDEN") return NextResponse.json({ error: "This review was removed by Insight Store moderators and can't be edited." }, { status: 409 });
  let orderId = existing?.orderId;
  if (!existing) {
    const elig = target.listingId ? await productEligibility(shopper.id, target.listingId) : await storeEligibility(shopper.id, target.businessId);
    if (!elig.canReview || !elig.orderId) return NextResponse.json({ error: elig.reason ?? "You can't review this yet." }, { status: 403 });
    orderId = elig.orderId;
  }
  const saved = await prisma.storeReview.upsert({
    where: { dedupeKey: key },
    create: { dedupeKey: key, kind: target.kind, shopperId: shopper.id, businessId: target.businessId, listingId: target.listingId, orderId: orderId!, rating, comment: comment.value, displayName: displayNameFor(shopper.name) },
    update: { rating, comment: comment.value },
  });
  if (!existing) {
    await notifyBusiness({
      businessId: target.businessId, type: "STORE_LISTING",
      title: target.kind === "PRODUCT" ? `New ${rating}-star review on "${target.label}"` : `New ${rating}-star store review`,
      message: comment.value ? comment.value.slice(0, 140) : "A customer left a rating.", link: "/seller?tab=reviews", dedupeKey: `review:${saved.id}:new`,
    }).catch(() => {});
  }
  return NextResponse.json({ review: mineShape(saved), created: !existing }, { status: existing ? 200 : 201 });
}
