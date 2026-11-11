import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";

// GET /api/notifications?cursor=<id>&limit=20
// The signed-in user's own notifications only (scoped by userId AND
// businessId), newest first, with an exact unread count.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const cursor = url.searchParams.get("cursor");
  const scope = { userId: session.sub, businessId: session.businessId };

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: scope,
      // Stable order even when a batch shares one timestamp.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, type: true, title: true, message: true, link: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { ...scope, isRead: false } }),
  ]);
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  return NextResponse.json({ items: page, unread, nextCursor: hasMore ? page[page.length - 1].id : null });
}
