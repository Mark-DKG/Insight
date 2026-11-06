import bcrypt from "bcryptjs";

// ----------------------------------------------------------------------------
// Password hashing
// ----------------------------------------------------------------------------

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ----------------------------------------------------------------------------
// Session tokens (JWT, short-lived access token + longer refresh token)
// The refresh token's hash is stored server-side in RefreshToken so it can be
// revoked; the access token is stateless and carries the tenant/role claims
// needed to authorize every request without a database round trip.
// ----------------------------------------------------------------------------

export { signAccessToken, verifyAccessToken } from "./jwt";
export type { SessionClaims } from "./jwt";

// Refresh tokens are opaque random strings; only their hash is persisted,
// so a leaked database row can't be replayed as a live token.
import { randomBytes, createHash } from "crypto";

const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(48).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  return { token, hash, expiresAt };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const AUTH_COOKIE = "insight_access_token";
export const REFRESH_COOKIE = "insight_refresh_token";

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
