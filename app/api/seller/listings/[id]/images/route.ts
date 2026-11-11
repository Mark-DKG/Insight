import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requireSeller, readUpload, actorLabel } from "@/lib/store/server";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, statusAfterContentEdit, type ListingStatus } from "@/lib/store/core";

const MAX_IMAGES = 6;

// POST (multipart: file) — add a product photo. Photos are part of what
// customers see, so adding one to an approved listing sends it back to draft.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const listing = await prisma.storeListing.findFirst({ where: { id: params.id, businessId: g.session.businessId }, include: { _count: { select: { images: true } } } });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  if (listing.status === "SUBMITTED" || listing.status === "UNDER_REVIEW") return NextResponse.json({ error: "This listing is being reviewed. Wait for the decision before changing photos." }, { status: 409 });
  if (listing._count.images >= MAX_IMAGES) return NextResponse.json({ error: `A listing can have at most ${MAX_IMAGES} photos.` }, { status: 400 });

  const upload = await readUpload(request, { maxBytes: IMAGE_MAX_BYTES, types: IMAGE_TYPES });
  if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: 400 });
  const from = listing.status as ListingStatus;
  const to = statusAfterContentEdit(from);
  const image = await prisma.$transaction(async (tx) => {
    const img = await tx.storeImage.create({
      data: { businessId: g.session.businessId, listingId: listing.id, mimeType: upload.mime, sizeBytes: upload.bytes.length, sortOrder: listing._count.images, data: Buffer.from(upload.bytes) },
      select: { id: true, sortOrder: true, mimeType: true, sizeBytes: true },
    });
    if (to !== from) {
      await tx.storeListing.update({ where: { id: listing.id }, data: { status: to, publishedAt: null } });
      await tx.storeListingEvent.create({ data: { listingId: listing.id, actorType: "BUSINESS_USER", actorId: g.session.sub, actorLabel: await actorLabel(g.session), action: "PHOTO_ADDED", fromStatus: from, toStatus: to, note: "Photos changed; the listing needs review again." } });
    }
    return img;
  });
  return NextResponse.json({ image, requiresReview: to !== from }, { status: 201 });
}
