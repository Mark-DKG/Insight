import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { platformAudit, requireAdmin } from "@/lib/admin/session";

const Schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12, "Use at least 12 characters.")
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
});

// POST /api/admin/auth/password — change own password. Other sessions for
// this admin are revoked; the current one stays signed in.
export async function POST(request: Request) {
  const ctx = await requireAdmin(null, { allowPasswordChangePending: true });
  if (ctx instanceof NextResponse) return ctx;

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid password." }, { status: 400 });
  }
  const admin = await prisma.platformAdmin.findUnique({ where: { id: ctx.admin.id } });
  if (!admin || !(await verifyPassword(parsed.data.currentPassword, admin.passwordHash))) {
    return NextResponse.json({ error: "Your current password is not correct." }, { status: 400 });
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json({ error: "Choose a password different from the current one." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false },
    }),
    prisma.platformAdminSession.updateMany({
      where: { adminId: admin.id, revokedAt: null, id: { not: ctx.sessionId } },
      data: { revokedAt: new Date() },
    }),
  ]);
  await platformAudit(ctx, { action: "ADMIN_PASSWORD_CHANGED", targetType: "PlatformAdmin", targetId: admin.id });
  return NextResponse.json({ ok: true });
}
