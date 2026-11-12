import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { afterFailure, isLocked, minutesLeft, normalizeEmail } from "@/lib/store/shopper-core";
import { dummyHash, startSession, toPublic } from "@/lib/store/shopper";

const Schema = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(200) });
const BAD = "Incorrect email or password.";

// POST /api/store/public/account/login
// Same message and similar timing whether or not the email exists. Five wrong
// passwords lock that account for 15 minutes.
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: BAD }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);
  const shopper = await prisma.storeShopper.findUnique({ where: { email } });

  if (shopper && isLocked(shopper.lockedUntil)) {
    return NextResponse.json({ error: `Too many attempts. Try again in ${minutesLeft(shopper.lockedUntil!)} minutes.` }, { status: 429 });
  }
  const ok = await verifyPassword(parsed.data.password, shopper?.passwordHash ?? (await dummyHash()));
  if (!shopper || !ok) {
    if (shopper) await prisma.storeShopper.update({ where: { id: shopper.id }, data: afterFailure(shopper.failedAttempts) });
    return NextResponse.json({ error: BAD }, { status: 401 });
  }
  await prisma.storeShopper.update({ where: { id: shopper.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await startSession(shopper.id);
  return NextResponse.json({ shopper: toPublic(shopper) }, { headers: { "Cache-Control": "no-store" } });
}
