import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { cookies } from "next/headers";
import { hashToken } from "@/lib/store/cart";
import { passwordProblem, afterFailure, isLocked, minutesLeft } from "@/lib/store/shopper-core";
import { currentShopper, SHOPPER_COOKIE } from "@/lib/store/shopper";

const Schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(200) });

// POST /api/store/public/account/password — change password; every other
// session for this shopper is signed out.
export async function POST(request: Request) {
  const s = await currentShopper();
  if (!s) return NextResponse.json({ error: "Sign in to manage your account." }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your current and new password." }, { status: 400 });
  if (isLocked(s.lockedUntil)) return NextResponse.json({ error: `Too many attempts. Try again in ${minutesLeft(s.lockedUntil!)} minutes.` }, { status: 429 });
  if (!(await verifyPassword(parsed.data.currentPassword, s.passwordHash))) {
    await prisma.storeShopper.update({ where: { id: s.id }, data: afterFailure(s.failedAttempts) });
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 403 });
  }
  const problem = passwordProblem(parsed.data.newPassword, s.email);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  await prisma.storeShopper.update({ where: { id: s.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword), failedAttempts: 0, lockedUntil: null } });
  const keep = cookies().get(SHOPPER_COOKIE)?.value;
  await prisma.storeShopperSession.deleteMany({ where: { shopperId: s.id, ...(keep ? { tokenHash: { not: hashToken(keep) } } : {}) } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
