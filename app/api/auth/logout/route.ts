import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, REFRESH_COOKIE, hashRefreshToken } from "@/lib/auth";

export async function POST() {
  const refreshToken = cookies().get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    const hash = hashRefreshToken(refreshToken);
    // Best-effort revoke; a missing/expired row is not an error worth
    // surfacing to the client — the goal (no valid session) is already met
    // once the cookies are cleared below.
    await prisma.refreshToken
      .updateMany({ where: { tokenHash: hash, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => null);
  }

  const response = NextResponse.json({ message: "Logged out." });
  response.cookies.delete(AUTH_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
