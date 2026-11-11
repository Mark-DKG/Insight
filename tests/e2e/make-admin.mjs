// Creates (or resets) a disposable platform admin for the E2E run. Test databases only.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
if (!/e2e/.test(email ?? "")) throw new Error("Refusing: ADMIN_EMAIL must contain 'e2e'.");
const data = { name: "E2E Admin", role: "PLATFORM_ADMIN", passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false, mfaEnabled: false, mfaSecret: null, isActive: true };
await prisma.platformAdmin.upsert({ where: { email }, update: data, create: { email, ...data } });
console.log("admin ready:", email);
await prisma.$disconnect();
