// Pure rules for Insight Store shopper accounts. No I/O, so they are unit
// tested directly and shared by every account route.

export const SHOPPER_SESSION_DAYS = 30;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

// A short deny-list of the passwords attackers try first. Not a substitute for
// length, just a guard against the worst offenders.
const COMMON = new Set([
  "password", "password1", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
  "password123", "iloveyou", "11111111", "00000000", "abc12345", "letmein1", "welcome1", "admin123",
]);

/** Returns a human-readable problem, or null when the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Choose something less guessable.";
  if (email && password.toLowerCase() === normalizeEmail(email)) return "Your password can't be your email address.";
  if (/^(.)\1+$/.test(password)) return "Your password can't be one repeated character.";
  return null;
}

export function isLocked(lockedUntil: Date | null | undefined, now = new Date()) {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

/** State after a failed sign-in: lock the account once the limit is reached. */
export function afterFailure(failedAttempts: number, now = new Date()) {
  const n = failedAttempts + 1;
  return n >= MAX_FAILED_ATTEMPTS
    ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) }
    : { failedAttempts: n, lockedUntil: null as Date | null };
}

export function minutesLeft(lockedUntil: Date, now = new Date()) {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

export interface PublicShopper {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: string | null;
}
