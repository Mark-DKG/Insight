import { prisma } from "@/lib/prisma";

// Optional email notifications a business can switch on or off. Essential
// account and security emails (verification, password reset, password changed,
// login alerts, seller application status) are NOT in this list and cannot be
// disabled. There is no marketing list.
export const EMAIL_PREF_KEYS = ["lowStock", "salesSummary", "purchaseOrders", "marketplace"] as const;
export type EmailPrefKey = (typeof EMAIL_PREF_KEYS)[number];
export type EmailPrefs = Record<EmailPrefKey, boolean>;

export const EMAIL_PREF_DEFAULTS: EmailPrefs = { lowStock: true, salesSummary: false, purchaseOrders: true, marketplace: true };

export function readPrefs(settings: unknown): EmailPrefs {
  const raw = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).emailNotifications : null) as Record<string, unknown> | null;
  const out = { ...EMAIL_PREF_DEFAULTS };
  if (raw && typeof raw === "object") for (const k of EMAIL_PREF_KEYS) if (typeof raw[k] === "boolean") out[k] = raw[k] as boolean;
  return out;
}

export async function businessEmailPref(businessId: string, key: EmailPrefKey): Promise<boolean> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { settings: true } });
  return readPrefs(b?.settings)[key];
}

/** Active recipients for optional business mail: owners and managers. */
export async function businessRecipients(businessId: string) {
  return prisma.user.findMany({ where: { businessId, isActive: true, role: { in: ["OWNER", "MANAGER"] } }, select: { id: true, email: true, name: true } });
}
