import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/email/tokens";
import { clientIp, rateLimited } from "@/lib/rate-limit";

const Schema = z.object({ token: z.string().min(20).max(200) });
const INVALID = "This confirmation link is invalid or has expired. Request a new one from your account.";

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: INVALID }, { status: 400 });
  if (await rateLimited(`verify:ip:${clientIp(request)}`, 30, 60 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return NextResponse.json({ error: INVALID }, { status: 400 });

  const ok = await prisma.$transaction(async (tx) => {
    const c = await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (c.count !== 1) return false;
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    return true;
  });
  if (!ok) return NextResponse.json({ error: INVALID }, { status: 400 });
  return NextResponse.json({ message: "Your email address is confirmed." });
}
