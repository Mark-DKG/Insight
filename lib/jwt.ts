import { SignJWT, jwtVerify } from "jose";

// Edge-runtime-safe: this file imports only `jose` (Web Crypto), so
// middleware.ts can use it. Node-only code (bcrypt, node:crypto) lives in
// lib/auth.ts and must never be imported from middleware.

export interface SessionClaims {
  sub: string; // userId
  businessId: string;
  branchId: string | null;
  role: "OWNER" | "MANAGER" | "CASHIER";
  email: string;
  /** Set at request time (never in the token): the business is waiting for store approval. */
  locked?: boolean;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret) throw new Error("JWT_SIGNING_SECRET is not set. Never hard-code this value.");
  return encoder.encode(secret);
}

export async function signAccessToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}
