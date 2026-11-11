import { headers } from "next/headers";

/** Absolute origin of the current request (for share links and OG tags). */
export function requestOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_STORE_ORIGIN;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}
