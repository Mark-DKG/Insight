import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_COOKIE, ADMIN_PENDING_COOKIE, adminCookieOptions, createAdminSession, platformAudit, readPending,
} from "@/lib/admin/session";
import { decryptSecret } from "@/lib/admin/crypto";
import { verifyTotp } from "@/lib/admin/totp";

// Step 2 of admin sign-in: a 6-digit code from the authenticator app. On
// first sign-in this also confirms enrolment and switches MFA on.

const Schema = z.object({ code: z.string().min(6).max(8) });

export async function POST(request: Request) {
  const pending = await readPending();
  if (!pending) {
    return NextResponse.json({ error: "Your sign-in step expired. Enter your email and password again." }, { status: 401 });
  }
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const failures = await prisma.platformAuditLog.count({
    where: { action: "ADMIN_MFA_FAILED", targetId: pending.adminId, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  if (failures >= 5) {
    return NextResponse.json({ error: "Too many incorrect codes. Try again in 15 minutes." }, { status: 429 });
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { id: pending.adminId } });
  if (!admin || !admin.isActive || !admin.mfaSecret) {
    return NextResponse.json({ error: "Sign-in failed. Start again." }, { status: 401 });
  }

  const valid = verifyTotp(decryptSecret(admin.mfaSecret), parsed.data.code);
  if (!valid) {
    await platformAudit(null, { action: "ADMIN_MFA_FAILED", actorEmail: admin.email, targetType: "PlatformAdmin", targetId: admin.id });
    return NextResponse.json({ error: "That code is not correct. Check your authenticator app and try again." }, { status: 401 });
  }

  const ctx = { admin: { id: admin.id, email: admin.email, role: admin.role } };
  if (pending.step === "enroll" && !admin.mfaEnabled) {
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { mfaEnabled: true } });
    await platformAudit(ctx, { action: "ADMIN_MFA_ENROLLED", targetType: "PlatformAdmin", targetId: admin.id });
  }

  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const { token, maxAge } = await createAdminSession(admin.id);
  await platformAudit(ctx, { action: "ADMIN_LOGIN", targetType: "PlatformAdmin", targetId: admin.id });

  const response = NextResponse.json({ ok: true, mustChangePassword: admin.mustChangePassword });
  response.cookies.set(ADMIN_COOKIE, token, { ...adminCookieOptions, maxAge });
  response.cookies.delete(ADMIN_PENDING_COOKIE);
  return response;
}
