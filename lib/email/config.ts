// Central email configuration. Every address, sender and URL used by the email
// system comes from here (environment variables), so nothing is hard-coded in
// templates or screens. No secrets are logged or returned from this module.

export const DEFAULT_CONTACT = "stylintech.x@gmail.com";
// Resend's shared test sender. It only delivers to the Resend account owner's
// own address; a verified domain is required to email anyone else.
export const RESEND_TEST_SENDER = "onboarding@resend.dev";
const DEFAULT_APP_URL = "https://insight-demo-omega.vercel.app";

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

export function stripCrlf(v: string): string {
  return v.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

export function isEmailAddress(v: string): boolean {
  return /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/.test(v) && v.length <= 254;
}

export interface EmailConfig {
  provider: "resend";
  /** Master switch from the environment. Default is off. */
  envEnabled: boolean;
  apiKeyConfigured: boolean;
  fromName: string;
  fromAddress: string;
  usingTestSender: boolean;
  replyTo: string;
  /** Where all admin and contact mail goes unless a Super Admin changes it. */
  contactAddress: string;
  adminAddress: string;
  appUrl: string;
  webhookSecretConfigured: boolean;
}

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const fromAddress = clean(env.EMAIL_FROM_ADDRESS) || RESEND_TEST_SENDER;
  const contact = clean(env.EMAIL_CONTACT_ADDRESS) || DEFAULT_CONTACT;
  const appUrl = (clean(env.APP_PUBLIC_URL) || DEFAULT_APP_URL).replace(/\/+$/, "");
  return {
    provider: "resend",
    envEnabled: clean(env.EMAIL_ENABLED).toLowerCase() === "true",
    apiKeyConfigured: clean(env.RESEND_API_KEY).length > 0,
    fromName: stripCrlf(clean(env.EMAIL_FROM_NAME) || "Insight") || "Insight",
    fromAddress,
    usingTestSender: fromAddress.toLowerCase() === RESEND_TEST_SENDER,
    replyTo: clean(env.EMAIL_REPLY_TO) || contact,
    contactAddress: contact,
    adminAddress: clean(env.EMAIL_ADMIN_ADDRESS) || contact,
    appUrl,
    webhookSecretConfigured: clean(env.EMAIL_WEBHOOK_SECRET).length > 0,
  };
}

export function fromHeader(cfg: EmailConfig): string {
  const name = cfg.fromName.replace(/["<>]/g, "");
  return `${name} <${cfg.fromAddress}>`;
}

/** Build an absolute link from the configured app URL. */
export function appLink(path: string, cfg: EmailConfig = emailConfig()): string {
  return `${cfg.appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Masks an address for logs and admin screens: "ab***@gmail.com". */
export function maskAddress(addr: string): string {
  const [local = "", domain = ""] = addr.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
