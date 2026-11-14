import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentShopper } from "@/lib/store/shopper";

export const dynamic = "force-dynamic";

// DELETE — a shopper removes their own review.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const shopper = await currentShopper().catch(() => null);
  if (!shopper) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const r = await prisma.storeReview.deleteMany({ where: { id: params.id, shopperId: shopper.id } });
  if (r.count !== 1) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
