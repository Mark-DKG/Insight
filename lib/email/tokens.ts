import { createHash, randomBytes } from "crypto";

// One-time tokens: a random value goes in the emailed link; only its SHA-256 is
// stored, so a database leak cannot be replayed. Tokens are never logged.
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export const RESET_TTL_MINUTES = 30;
export const VERIFY_TTL_HOURS = 24;
