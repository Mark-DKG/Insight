import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cleanChannel } from "@/lib/store/core";
import { PUBLIC_LISTING_WHERE } from "@/lib/store/listing";

const Schema = z.object({
  channel: z.string().max(20),
  event: z.enum(["SHARE", "VISIT"]),
  targetType: z.enum(["listing", "seller", "store"]),
  targetId: z.string().max(80),
});

// POST — count a share-button tap or a visit that arrived through a shared
// link (?ref=<channel>). These are Insight's own counts of link activity;
// no social network API is involved.
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  const channel = cleanChannel(parsed.data.channel);
  if (!channel) return NextResponse.json({ error: "Unknown channel." }, { status: 400 });
  const { event, targetType, targetId } = parsed.data;
  let businessId: string | null = null;
  if (targetType === "listing") {
    const l = await prisma.storeListing.findFirst({ where: { ...PUBLIC_LISTING_WHERE, id: targetId }, select: { businessId: true } });
    if (!l) return NextResponse.json({ ok: false }, { status: 404 });
    businessId = l.businessId;
  } else if (targetType === "seller") {
    const s = await prisma.storeSeller.findFirst({ where: { slug: targetId, status: "ACTIVE" }, select: { businessId: true } });
    if (!s) return NextResponse.json({ ok: false }, { status: 404 });
    businessId = s.businessId;
  }
  await prisma.storeAttributionEvent.create({ data: { channel, event, targetType, targetId, businessId } });
  const res = NextResponse.json({ ok: true });
  // Remember the channel a visitor arrived from so a later order can be attributed.
  if (event === "VISIT") res.cookies.set("insight_store_ref", channel, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 86400 });
  return res;
}
