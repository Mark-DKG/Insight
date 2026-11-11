import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { ADMIN_PENDING_COOKIE, adminCookieOptions, platformAudit, signPending } from "@/lib/admin/session";
import { encryptSecret } from "@/lib/admin/crypto";
import { generateTotpSecret, otpauthUri } from "@/lib/admin/totp";

// Step 1 of admin sign-in: email + password. Never creates a session on its
// own — every administrator must complete MFA (enrolling on first sign-in).

const Schema = z.object({ email: z.string().email(), password: z.string().min(1) });
const GENERIC = "Incorrect email or password.";
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: GENERIC }, { status: 401 });
  const email = parsed.data.email.trim().toLowerCase();

  const failures = await prisma.platformAuditLog.count({
    where: { action: "ADMIN_LOGIN_FAILED", actorEmail: email, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  if (failures >= MAX_FAILURES) {
    return NextResponse.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { email } });
  const ok = admin && admin.isActive && (await verifyPassword(parsed.data.password, admin.passwordHash));
  if (!admin || !ok) {
    await platformAudit(null, { action: "ADMIN_LOGIN_FAILED", actorEmail: email, reason: "password" });
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  let step: "mfa" | "enroll" = "mfa";
  let enrollment: { secret: string; uri: string } | undefined;
  if (!admin.mfaEnabled) {
    // First sign-in (or MFA reset): issue a fresh secret to enrol.
    step = "enroll";
    const secret = generateTotpSecret();
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { mfaSecret: encryptSecret(secret) } });
    enrollment = { secret, uri: otpauthUri(secret, admin.email) };
  }

  const response = NextResponse.json({ step, enrollment });
  response.cookies.set(ADMIN_PENDING_COOKIE, await signPending(admin.id, step), { ...adminCookieOptions, maxAge: 300 });
  return response;
}
