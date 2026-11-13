import { createHmac, timingSafeEqual } from "crypto";

// Resend signs webhooks with Svix: headers svix-id, svix-timestamp and
// svix-signature ("v1,<base64 hmac>", possibly several, space separated).
// signed content = `${id}.${timestamp}.${rawBody}`, key = base64 part of the
// secret after the "whsec_" prefix.

const TOLERANCE_SECONDS = 5 * 60;

export function verifyWebhook(rawBody: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();
  for (const part of headers.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

/** Maps a Resend event type to a delivery status. Unknown types return null. */
export function statusForEvent(type: string): string | null {
  switch (type) {
    case "email.sent": return "SENT";
    case "email.delivered": return "DELIVERED";
    case "email.delivery_delayed": return "DELAYED";
    case "email.bounced": return "BOUNCED";
    case "email.complained": return "COMPLAINED";
    case "email.failed": return "FAILED";
    case "email.suppressed": return "SUPPRESSED";
    default: return null;
  }
}

// A later status must not be overwritten by an earlier one arriving late.
const RANK: Record<string, number> = { QUEUED: 0, SENDING: 1, SENT: 2, DELAYED: 3, DELIVERED: 4, FAILED: 5, SUPPRESSED: 5, BOUNCED: 6, COMPLAINED: 7 };
export function shouldAdvance(current: string, next: string): boolean {
  return (RANK[next] ?? 0) > (RANK[current] ?? 0);
}
