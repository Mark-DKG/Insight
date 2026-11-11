import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

// GET /api/admin/notifications?cursor=&limit= — platform notifications with
// this administrator's own read state.
export async function GET(request: Request) {
  const ctx = await requireAdmin(null);
  if (ctx instanceof NextResponse) return ctx;
  const u = new URL(request.url).searchParams;
  const limit = Math.min(50, Math.max(1, Number(u.get("limit") ?? 20) || 20));
  const cursor = u.get("cursor");
  const [rows, total, read] = await Promise.all([
    prisma.platformNotification.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { reads: { where: { adminId: ctx.admin.id }, select: { readAt: true } } },
    }),
    prisma.platformNotification.count({ where: { createdAt: { gte: new Date(Date.now() - 90 * 86400_000) } } }),
    prisma.platformNotificationRead.count({ where: { adminId: ctx.admin.id, notification: { createdAt: { gte: new Date(Date.now() - 90 * 86400_000) } } } }),
  ]);
  const page = rows.slice(0, limit);
  return NextResponse.json({
    items: page.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, link: n.link, createdAt: n.createdAt, isRead: n.reads.length > 0 })),
    unread: Math.max(0, total - read),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  });
}
