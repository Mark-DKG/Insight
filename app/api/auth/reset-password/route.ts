import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { hashToken } from "@/lib/email/tokens";
import { sendAuthEmail } from "@/lib/email/service";
import { clientIp, rateLimited } from "@/lib/rate-limit";

const Schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(8, "Password must be at least 8 characters.").max(200) });
const INVALID = "This reset link is invalid or has expired. Request a new one.";

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? INVALID }, { status: 400 });
  if (await rateLimited(`reset:ip:${clientIp(request)}`, 20, 60 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, include: { user: { select: { id: true, email: true, name: true, businessId: true, isActive: true } } } });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) return NextResponse.json({ error: INVALID }, { status: 400 });
  if (parsed.data.password.toLowerCase() === record.user.email.toLowerCase()) return NextResponse.json({ error: "Password cannot be your email address." }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);
  const claimed = await prisma.$transaction(async (tx) => {
    // Single use: only one request can flip usedAt from null.
    const c = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (c.count !== 1) return false;
    await tx.user.update({ where: { id: record.user.id }, data: { passwordHash } });
    await tx.refreshToken.updateMany({ where: { userId: record.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { businessId: record.user.businessId, userId: record.user.id, action: "PASSWORD_RESET", entityType: "User", entityId: record.user.id } });
    return true;
  });
  if (!claimed) return NextResponse.json({ error: INVALID }, { status: 400 });

  await sendAuthEmail("password_changed", record.user.email, { name: record.user.name, when: new Date().toUTCString() }, `pwchanged:${record.id}`, undefined, record.user.businessId);
  return NextResponse.json({ message: "Your password was changed. You can sign in now." });
}
