// Pure rules for Insight Store reviews. No I/O, so they are unit tested
// directly and shared by the shopper, seller and admin routes.

export const MAX_COMMENT = 1000;
export const MAX_REPLY = 1000;
export const MIN_REPORT_REASON = 5;
export const REVIEW_PAGE_SIZE = 10;
// Writes per shopper per hour (create, edit, delete and report together).
export const REVIEW_WRITES_PER_HOUR = 20;

export type ReviewKind = "PRODUCT" | "STORE";

export const dedupeKey = (kind: ReviewKind, shopperId: string, targetId: string) =>
  `${kind === "PRODUCT" ? "P" : "S"}:${shopperId}:${targetId}`;

/** "Ama Kofi Mensah" -> "Ama M."; "Ama" -> "Ama". Fixed when the review is written. */
export function displayNameFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Shopper";
  const first = parts[0].slice(0, 20);
  if (parts.length === 1) return first;
  const initial = Array.from(parts[parts.length - 1])[0]?.toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

export function parseRating(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

const LINK = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|xyz|site|app|co|gh|me|ly)\b)/i;

/** Cleans free text; returns an error message instead when it isn't acceptable. */
export function cleanText(raw: unknown, max: number, what = "Comment"): { value: string | null; error?: string } {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== "string") return { value: null, error: `${what} must be text.` };
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text === "") return { value: null };
  if (text.length < 3) return { value: null, error: `${what} is too short.` };
  if (text.length > max) return { value: null, error: `${what} can be at most ${max} characters.` };
  if (LINK.test(text)) return { value: null, error: `${what} can't contain links.` };
  return { value: text };
}

export type RatingSummary = { average: number; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> };

export function summarise(ratings: number[]): RatingSummary {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary["distribution"];
  let total = 0;
  for (const r of ratings) {
    if (r >= 1 && r <= 5) { distribution[r as 1 | 2 | 3 | 4 | 5]++; total += r; }
  }
  const count = ratings.filter((r) => r >= 1 && r <= 5).length;
  return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

export const starsText = (avg: number) => `${avg.toFixed(1)} out of 5`;
