import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appLink } from "@/lib/email/config";
import { newToken, RESET_TTL_MINUTES } from "@/lib/email/tokens";
import { sendAuthEmail } from "@/lib/email/service";
import { clientIp, rateLimited } from "@/lib/rate-limit";

// Always answers the same way, whether or not the address has an account, so it
// cannot be used to discover who is registered.
const GENERIC = { message: "If an account exists for that email, we have sent a link to reset the password." };

const Schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(GENERIC);
  const { email } = parsed.data;

  if ((await rateLimited(`forgot:ip:${clientIp(request)}`, 10, 60 * 60_000)) || (await rateLimited(`forgot:email:${email}`, 3, 60 * 60_000))) {
    return NextResponse.json(GENERIC);
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, isActive: true, businessId: true } });
  if (user?.isActive) {
    const { token, hash } = newToken();
    const record = await prisma.$transaction(async (tx) => {
      // Only the newest link works.
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      return tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) } });
    });
    await sendAuthEmail(
      "password_reset",
      email,
      { name: user.name, expiresInMinutes: RESET_TTL_MINUTES },
      `reset:${record.id}`,
      { url: appLink(`/reset-password?token=${encodeURIComponent(token)}`) },
      user.businessId,
    );
  }
  return NextResponse.json(GENERIC);
}
