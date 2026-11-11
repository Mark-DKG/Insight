import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

const Schema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })]);

export async function POST(request: Request) {
  const ctx = await requireAdmin(null);
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const since = new Date(Date.now() - 90 * 86400_000);
  const ids = "ids" in parsed.data
    ? (await prisma.platformNotification.findMany({ where: { id: { in: parsed.data.ids } }, select: { id: true } })).map((n) => n.id)
    : (await prisma.platformNotification.findMany({ where: { createdAt: { gte: since }, reads: { none: { adminId: ctx.admin.id } } }, select: { id: true }, take: 1000 })).map((n) => n.id);
  if (ids.length) {
    await prisma.platformNotificationRead.createMany({ data: ids.map((notificationId) => ({ notificationId, adminId: ctx.admin.id })), skipDuplicates: true });
  }
  const [total, read] = await Promise.all([
    prisma.platformNotification.count({ where: { createdAt: { gte: since } } }),
    prisma.platformNotificationRead.count({ where: { adminId: ctx.admin.id, notification: { createdAt: { gte: since } } } }),
  ]);
  return NextResponse.json({ unread: Math.max(0, total - read) });
}
