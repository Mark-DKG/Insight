/**
 * Recovery for a locked-out platform administrator (lost phone, forgotten
 * password). Requires direct database credentials — there is deliberately no
 * web endpoint for this, so it cannot become a public backdoor.
 *
 *   DATABASE_URL=... ADMIN_EMAIL=you@example.com npx tsx scripts/reset-admin-access.ts
 *
 * Effect: sets a new random temporary password, clears MFA (re-enrolment is
 * forced at next sign-in), forces a password change, revokes all sessions,
 * and writes PLATFORM_ADMIN_ACCESS_RESET to the platform audit log.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) throw new Error("Set ADMIN_EMAIL.");
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.platformAdmin.findUnique({ where: { email } });
    if (!admin) throw new Error("No platform administrator with that email.");
    const password = randomBytes(12).toString("base64url") + "9a";
    await prisma.$transaction([
      prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, mfaEnabled: false, mfaSecret: null, isActive: true },
      }),
      prisma.platformAdminSession.updateMany({ where: { adminId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.platformAuditLog.create({
        data: { actorEmail: "recovery-script", action: "PLATFORM_ADMIN_ACCESS_RESET", targetType: "PlatformAdmin", targetId: admin.id },
      }),
    ]);
    console.log(`Access reset for ${email}. Temporary password (shown once): ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
