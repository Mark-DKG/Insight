import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";

const Schema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }),
]);

// POST /api/notifications/read  { ids: [...] } or { all: true }
// Only ever touches the caller's own notifications.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const where = {
    userId: session.sub,
    businessId: session.businessId,
    isRead: false,
    ...("ids" in parsed.data ? { id: { in: parsed.data.ids } } : {}),
  };
  const result = await prisma.notification.updateMany({ where, data: { isRead: true, readAt: new Date() } });
  const unread = await prisma.notification.count({ where: { userId: session.sub, businessId: session.businessId, isRead: false } });
  return NextResponse.json({ updated: result.count, unread });
}
