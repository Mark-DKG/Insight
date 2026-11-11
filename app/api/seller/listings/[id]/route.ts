import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { requireSeller, availabilityFor, actorLabel } from "@/lib/store/server";
import { statusAfterContentEdit, type ListingStatus } from "@/lib/store/core";
import { effectivePrice, sellerListingInclude } from "@/lib/store/listing";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:read")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const listing = await prisma.storeListing.findFirst({
    where: { id: params.id, businessId: session.businessId },
    include: { ...sellerListingInclude, events: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const stock = await availabilityFor([{ productId: listing.productId, businessId: listing.businessId }]);
  return NextResponse.json({
    listing: {
      ...listing, price: listing.price === null ? null : Number(listing.price), effectivePrice: effectivePrice(listing, listing.product),
      product: { ...listing.product, sellingPrice: Number(listing.product.sellingPrice) }, available: stock.get(listing.productId) ?? 0,
    },
  });
}

const Patch = z.object({
  title: z.string().trim().min(2, "Give the listing a title.").max(160).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  price: z.number().positive("Price must be more than zero.").max(10_000_000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  isVisible: z.boolean().optional(),
}).strict();

// PATCH — edit listing content. Changing what customers see (title,
// description, price, category) after approval sends the listing back to
// draft so it is reviewed again. Hiding/showing does not.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid listing." }, { status: 400 });
  const d = parsed.data;
  const listing = await prisma.storeListing.findFirst({ where: { id: params.id, businessId: g.session.businessId } });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  if (listing.status === "SUBMITTED" || listing.status === "UNDER_REVIEW") {
    if (d.title !== undefined || d.description !== undefined || d.price !== undefined || d.categoryId !== undefined) {
      return NextResponse.json({ error: "This listing is being reviewed. Wait for the decision before editing it." }, { status: 409 });
    }
  }
  if (d.categoryId && !(await prisma.storeCategory.findFirst({ where: { id: d.categoryId, isActive: true } }))) {
    return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
  }
  const contentChanged =
    (d.title !== undefined && d.title !== listing.title) ||
    (d.description !== undefined && (d.description || null) !== listing.description) ||
    (d.price !== undefined && (d.price ?? null) !== (listing.price === null ? null : Number(listing.price))) ||
    (d.categoryId !== undefined && (d.categoryId ?? null) !== listing.categoryId);
  const from = listing.status as ListingStatus;
  const to = contentChanged ? statusAfterContentEdit(from) : from;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.storeListing.update({
      where: { id: listing.id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.price !== undefined ? { price: d.price } : {}),
        ...(d.categoryId !== undefined ? { categoryId: d.categoryId } : {}),
        ...(d.isVisible !== undefined ? { isVisible: d.isVisible } : {}),
        status: to,
        ...(to !== from && from === "PUBLISHED" ? { publishedAt: null } : {}),
      },
    });
    if (contentChanged || d.isVisible !== undefined) {
      await tx.storeListingEvent.create({
        data: {
          listingId: listing.id, actorType: "BUSINESS_USER", actorId: g.session.sub, actorLabel: await actorLabel(g.session),
          action: contentChanged ? "EDITED" : d.isVisible ? "SHOWN" : "HIDDEN", fromStatus: from, toStatus: to,
          note: contentChanged && to !== from ? "Content changed; the listing needs review again." : null,
        },
      });
    }
    return u;
  });
  return NextResponse.json({ listing: { ...updated, price: updated.price === null ? null : Number(updated.price) }, requiresReview: to !== from });
}

// DELETE — remove a listing that is not live. Published listings must be
// unpublished first so customers never hit a vanished product mid-order.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const listing = await prisma.storeListing.findFirst({ where: { id: params.id, businessId: g.session.businessId } });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  if (listing.status === "PUBLISHED" || listing.status === "SUBMITTED" || listing.status === "UNDER_REVIEW") {
    return NextResponse.json({ error: "Unpublish the listing (or wait for its review) before deleting it." }, { status: 409 });
  }
  await prisma.storeListing.delete({ where: { id: listing.id } });
  await prisma.auditLog.create({
    data: { businessId: g.session.businessId, userId: g.session.sub, branchId: g.session.branchId, action: "STORE_LISTING_DELETED", entityType: "StoreListing", entityId: listing.id, previousValue: { title: listing.title, productId: listing.productId } },
  });
  return NextResponse.json({ ok: true });
}
