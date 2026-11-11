import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requireSeller, actorLabel } from "@/lib/store/server";
import { listingTransition, type ListingStatus } from "@/lib/store/core";
import { notifyPlatform } from "@/lib/notify";

const Schema = z.object({ action: z.enum(["submit", "unpublish", "republish"]) });

// POST /api/seller/listings/[id]/action { action }
//   submit    → send for Insight Store review (approval publishes it)
//   unpublish → take a live listing off the marketplace
//   republish → put an approved, unedited listing back without review
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const { action } = parsed.data;

  const listing = await prisma.storeListing.findFirst({
    where: { id: params.id, businessId: g.session.businessId },
    include: { product: { select: { isActive: true, sellingPrice: true, imageUrl: true } }, _count: { select: { images: true } } },
  });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const from = listing.status as ListingStatus;
  const to = listingTransition(action, from, "seller");
  if (!to) return NextResponse.json({ error: `A ${from.toLowerCase().replace("_", " ")} listing can't be ${action === "submit" ? "submitted" : action + "ed"}.` }, { status: 409 });

  if (action === "submit" || action === "republish") {
    if (!listing.product.isActive) return NextResponse.json({ error: "The inventory product is archived. Restore it before listing." }, { status: 400 });
    const price = Number(listing.price ?? listing.product.sellingPrice);
    if (!(price > 0)) return NextResponse.json({ error: "Set a price above zero before submitting." }, { status: 400 });
    if (listing._count.images === 0 && !listing.product.imageUrl) return NextResponse.json({ error: "Add at least one product photo before submitting." }, { status: 400 });
    if (!listing.categoryId) return NextResponse.json({ error: "Choose a marketplace category before submitting." }, { status: 400 });
  }

  const label = await actorLabel(g.session);
  const ok = await prisma.$transaction(async (tx) => {
    const u = await tx.storeListing.updateMany({
      where: { id: listing.id, status: from },
      data: {
        status: to,
        ...(action === "submit" ? { submittedAt: new Date(), rejectionReason: null } : {}),
        ...(to === "PUBLISHED" ? { publishedAt: new Date() } : {}),
        ...(to === "UNPUBLISHED" ? { publishedAt: null } : {}),
      },
    });
    if (u.count !== 1) return false;
    await tx.storeListingEvent.create({
      data: { listingId: listing.id, actorType: "BUSINESS_USER", actorId: g.session.sub, actorLabel: label, action: action.toUpperCase(), fromStatus: from, toStatus: to },
    });
    if (action === "submit") {
      await notifyPlatform({
        type: "STORE_LISTING", title: "Listing submitted for review",
        message: `"${listing.title}" is waiting for review.`, link: `/admin/store?tab=listings`,
        dedupeKey: `listing:${listing.id}:submitted:${Date.now()}`,
      }, tx);
    }
    return true;
  });
  if (!ok) return NextResponse.json({ error: "The listing changed while you were working. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ status: to });
}
