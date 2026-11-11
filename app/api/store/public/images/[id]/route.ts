import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "@/lib/store/listing";

// Public product photo. Served only while its listing is publicly visible.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const image = await prisma.storeImage.findFirst({ where: { id: params.id, listing: PUBLIC_LISTING_WHERE } });
  if (!image) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: { "Content-Type": image.mimeType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
