import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { listingTransition, type ListingStatus } from "@/lib/store/core";
import { notifyBusiness } from "@/lib/notify";

const Schema = z.object({
  action: z.enum(["start_review", "approve", "reject", "admin_unpublish", "feature", "unfeature"]),
  reason: z.string().trim().max(1000).optional(),
});

// POST — moderate a listing. Approval publishes it (the seller already asked
// for it to go live by submitting); rejection and takedown need a reason.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { action } = parsed.data;
  const reason = parsed.data.reason ?? "";
  const listing = await prisma.storeListing.findUnique({ where: { id: params.id }, include: { business: { select: { storeSeller: { select: { status: true } } } } } });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

  if (action === "feature" || action === "unfeature") {
    await prisma.$transaction(async (tx) => {
      await tx.storeListing.update({ where: { id: listing.id }, data: { isFeatured: action === "feature" } });
      await platformAudit(ctx, { action: `STORE_LISTING_${action.toUpperCase()}`, targetBusinessId: listing.businessId, targetType: "StoreListing", targetId: listing.id }, tx);
    });
    return NextResponse.json({ ok: true });
  }

  const from = listing.status as ListingStatus;
  const to = listingTransition(action, from, "admin");
  if (!to) return NextResponse.json({ error: `This listing is ${from.toLowerCase().replace("_", " ")} and can't be ${action.replace("admin_", "").replace("_", " ")}ed.` }, { status: 409 });
  if ((action === "reject" || action === "admin_unpublish") && reason.length < 5) return NextResponse.json({ error: "Give the seller a reason (at least 5 characters)." }, { status: 400 });
  if (action === "approve" && listing.business.storeSeller?.status !== "ACTIVE") return NextResponse.json({ error: "The seller is suspended. Reinstate the seller before approving listings." }, { status: 409 });

  const ok = await prisma.$transaction(async (tx) => {
    const u = await tx.storeListing.updateMany({
      where: { id: listing.id, status: from },
      data: {
        status: to, reviewedByAdminId: ctx.admin.id,
        ...(to === "PUBLISHED" ? { publishedAt: new Date(), rejectionReason: null } : {}),
        ...(to === "REJECTED" ? { rejectionReason: reason } : {}),
        ...(to === "UNPUBLISHED" ? { publishedAt: null, rejectionReason: reason } : {}),
      },
    });
    if (u.count !== 1) return false;
    const eventAction = { start_review: "REVIEW_STARTED", approve: "APPROVED", reject: "REJECTED", admin_unpublish: "TAKEN_DOWN" }[action];
    await tx.storeListingEvent.create({ data: { listingId: listing.id, actorType: "PLATFORM_ADMIN", actorId: ctx.admin.id, actorLabel: ctx.admin.name, action: eventAction, fromStatus: from, toStatus: to, note: reason || null } });
    await platformAudit(ctx, { action: `STORE_LISTING_${eventAction}`, targetBusinessId: listing.businessId, targetType: "StoreListing", targetId: listing.id, reason: reason || null, before: { status: from }, after: { status: to } }, tx);
    if (action !== "start_review") {
      await notifyBusiness({
        businessId: listing.businessId, type: "STORE_LISTING",
        title: action === "approve" ? `"${listing.title}" is live on Insight Store` : action === "reject" ? `"${listing.title}" was not approved` : `"${listing.title}" was taken down`,
        message: action === "approve" ? "Customers can now find and order it." : `Reason: ${reason}`,
        link: "/seller?tab=listings", dedupeKey: `listing:${listing.id}:${eventAction}:${Date.now()}`,
      }, tx);
    }
    return true;
  });
  if (!ok) return NextResponse.json({ error: "The listing changed while you were reviewing it. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ status: to });
}
