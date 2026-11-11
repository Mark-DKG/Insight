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

/**
 * Absolute origin of the public marketing site.
 *
 * Deliberately separate from requestOrigin(): once the marketplace moves to
 * store.insight.9devs.app, NEXT_PUBLIC_STORE_ORIGIN points there, and reusing
 * it would publish a canonical URL for the landing page that points at the
 * store. Falls back to the current request host, which is correct on any
 * deployment URL.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  } catch {
    return "";
  }
}
