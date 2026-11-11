import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requireSeller } from "@/lib/store/server";

// DELETE — remove a photo. Removing does not need re-review.
export async function DELETE(_request: Request, { params }: { params: { id: string; imageId: string } }) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const image = await prisma.storeImage.findFirst({ where: { id: params.imageId, listingId: params.id, businessId: g.session.businessId }, include: { listing: { select: { status: true } } } });
  if (!image) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  if (image.listing.status === "SUBMITTED" || image.listing.status === "UNDER_REVIEW") return NextResponse.json({ error: "This listing is being reviewed." }, { status: 409 });
  if (image.listing.status === "PUBLISHED") {
    const count = await prisma.storeImage.count({ where: { listingId: params.id } });
    if (count <= 1) return NextResponse.json({ error: "A live listing needs at least one photo. Add another photo first." }, { status: 400 });
  }
  await prisma.storeImage.delete({ where: { id: image.id } });
  return NextResponse.json({ ok: true });
}

// GET — the seller's own photo (any listing status).
export async function GET(_request: Request, { params }: { params: { id: string; imageId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const image = await prisma.storeImage.findFirst({ where: { id: params.imageId, listingId: params.id, businessId: session.businessId } });
  if (!image) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
