import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE, getAdminContext, platformAudit } from "@/lib/admin/session";

export async function POST() {
  const ctx = await getAdminContext();
  if (ctx) {
    await prisma.platformAdminSession.update({ where: { id: ctx.sessionId }, data: { revokedAt: new Date() } }).catch(() => null);
    await platformAudit(ctx, { action: "ADMIN_LOGOUT", targetType: "PlatformAdmin", targetId: ctx.admin.id });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
