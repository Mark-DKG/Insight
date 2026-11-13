import { prisma } from "@/lib/prisma";
import { appLink } from "./config";
import { newToken, VERIFY_TTL_HOURS } from "./tokens";
import { sendAuthEmail } from "./service";

/** Issues a fresh single-use verification link (older ones stop working) and emails it. */
export async function sendVerificationEmail(userId: string): Promise<"sent" | "off" | "failed"> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, businessId: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return "sent";
  const { token, hash } = newToken();
  const record = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    return tx.emailVerificationToken.create({ data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 3600_000) } });
  });
  const out = await sendAuthEmail("verify_email", user.email, { name: user.name, expiresInHours: VERIFY_TTL_HOURS }, `verify:${record.id}`, { url: appLink(`/verify-email?token=${encodeURIComponent(token)}`) }, user.businessId);
  if (out.result === "skipped") return "off";
  return out.ok || out.result === "queued" ? "sent" : "failed";
}
