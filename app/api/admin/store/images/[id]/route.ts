import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

// Listing photo for moderators (any listing status).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const image = await prisma.storeImage.findUnique({ where: { id: params.id } });
  if (!image) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
