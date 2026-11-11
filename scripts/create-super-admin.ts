/**
 * Provision the FIRST platform Super Admin. Server-side only; never shipped
 * to the browser.
 *
 *   DATABASE_URL=... SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_NAME="Your Name" \
 *     npx tsx scripts/create-super-admin.ts
 *
 * - Refuses to run if a Super Admin already exists (later Super Admins are
 *   appointed from inside the console by an existing Super Admin).
 * - Uses SUPER_ADMIN_PASSWORD if set (min 12 chars); otherwise generates a
 *   random temporary password and prints it once.
 * - The account must change its password and enrol an authenticator app
 *   (MFA) on first sign-in.
 * - Records PLATFORM_ADMIN_PROVISIONED in the append-only platform audit log.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.SUPER_ADMIN_NAME ?? "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Set SUPER_ADMIN_EMAIL to a valid email address.");
  if (!name) throw new Error("Set SUPER_ADMIN_NAME.");

  let password = process.env.SUPER_ADMIN_PASSWORD ?? "";
  let generated = false;
  if (!password) {
    password = randomBytes(12).toString("base64url") + "9a";
    generated = true;
  }
  if (password.length < 12) throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.platformAdmin.count({ where: { role: "SUPER_ADMIN" } });
    if (existing > 0) {
      throw new Error("A Super Admin already exists. Additional Super Admins must be appointed from the console by an existing Super Admin.");
    }
    const admin = await prisma.platformAdmin.create({
      data: { email, name, role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
    });
    await prisma.platformAuditLog.create({
      data: { actorEmail: "provisioning-script", action: "PLATFORM_ADMIN_PROVISIONED", targetType: "PlatformAdmin", targetId: admin.id, after: { email, role: "SUPER_ADMIN" } },
    });
    console.log(`Super Admin created: ${email}`);
    if (generated) console.log(`Temporary password (shown once): ${password}`);
    console.log("Sign in at /admin/login. You will be asked to enrol an authenticator app and change the password.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
