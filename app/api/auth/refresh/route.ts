import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  AUTH_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
} from "@/lib/auth";

// Rotates the refresh token on every use: the old one is revoked and a new
// one issued, so a stolen-but-unused refresh token becomes invalid the
// moment the legitimate device refreshes, and reuse of a revoked token is
// itself a signal worth logging (not implemented here, but the hook point
// is this handler).

async function rotate(): Promise<{ ok: false; clear: boolean; error: string } | { ok: true; accessToken: string; refreshToken: string }> {
  const presented = cookies().get(REFRESH_COOKIE)?.value;

  if (!presented) {
    return { ok: false, clear: false, error: "No session to refresh." };
  }

  const presentedHash = hashRefreshToken(presented);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: presentedHash },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    return { ok: false, clear: true, error: "Session expired. Please log in again." };
  }

  const { user } = stored;

  const { token: newRefreshToken, hash: newHash, expiresAt } = generateRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: newHash, expiresAt },
    }),
  ]);

  const accessToken = await signAccessToken({
    sub: user.id,
    businessId: user.businessId,
    branchId: user.branchId,
    role: user.role,
    email: user.email,
  });

  return { ok: true, accessToken, refreshToken: newRefreshToken };
}

function setCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  response.cookies.set(AUTH_COOKIE, accessToken, { ...cookieOptions, maxAge: 15 * 60 });
  response.cookies.set(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 });
}

// POST /api/auth/refresh — used by the client when an API call returns 401.
export async function POST() {
  const r = await rotate();
  if (!r.ok) {
    const response = NextResponse.json({ error: r.error }, { status: 401 });
    if (r.clear) {
      response.cookies.delete(AUTH_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
    }
    return response;
  }
  const response = NextResponse.json({ message: "Session refreshed." });
  setCookies(response, r.accessToken, r.refreshToken);
  return response;
}

// GET /api/auth/refresh?next=/path — used by middleware when a page load
// arrives with an expired access token but a live refresh token, so users
// aren't sent to the login screen every 15 minutes.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("next") ?? "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  const r = await rotate();
  if (!r.ok) {
    const response = NextResponse.redirect(new URL("/login", url));
    if (r.clear) {
      response.cookies.delete(AUTH_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
    }
    return response;
  }
  const response = NextResponse.redirect(new URL(next, url));
  setCookies(response, r.accessToken, r.refreshToken);
  return response;
}
