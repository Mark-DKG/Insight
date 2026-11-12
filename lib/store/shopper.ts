import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { hashToken, newToken } from "./cart";
import { SHOPPER_SESSION_DAYS, type PublicShopper } from "./shopper-core";

// Shopper accounts: separate identity from business users and platform admins.
export const SHOPPER_COOKIE = "insight_shopper_session";

const cookieOpts = (maxAge: number) => ({
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge,
});

export const toPublic = (s: { id: string; email: string; name: string; phone: string | null; defaultAddress: string | null }): PublicShopper => ({
  id: s.id, email: s.email, name: s.name, phone: s.phone, defaultAddress: s.defaultAddress,
});

/** The signed-in shopper for this request, or null. Never throws. */
export async function currentShopper() {
  const token = cookies().get(SHOPPER_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.storeShopperSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { shopper: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.shopper;
}

export async function startSession(shopperId: string) {
  // Opportunistic cleanup keeps the table small without a scheduled job.
  await prisma.storeShopperSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  const token = newToken();
  await prisma.storeShopperSession.create({
    data: { shopperId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SHOPPER_SESSION_DAYS * 86400_000) },
  });
  cookies().set(SHOPPER_COOKIE, token, cookieOpts(SHOPPER_SESSION_DAYS * 86400));
}

export async function endSession() {
  const token = cookies().get(SHOPPER_COOKIE)?.value;
  if (token && token.length <= 100) await prisma.storeShopperSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookies().set(SHOPPER_COOKIE, "", cookieOpts(0));
}

// Comparing against a real hash when the email is unknown keeps the response
// time the same, so sign-in can't be used to discover which emails have accounts.
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword("insight-store-timing-pad"));
