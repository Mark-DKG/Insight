import { appLink, emailConfig, type EmailConfig } from "./config";

// Central branded template system. Every email is the same layout (HTML and
// plain text) with the Insight logo, deep green header, honeydew accents and a
// footer carrying the Insight identity and the single official contact address.
// No emojis. All links are built from the configured app URL.

const DEEP = "#145A32";
const GREEN = "#2E7D32";
const HONEYDEW = "#F0FFF0";
const INK = "#1F2937";
const MUTED = "#5B6B63";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export interface Rendered { subject: string; html: string; text: string }

interface Block {
  heading: string;
  /** Plain paragraphs. */
  paragraphs: string[];
  /** Optional label/value rows (for example order details). */
  details?: Array<[string, string]>;
  cta?: { label: string; url: string };
  /** Small print under the button. */
  note?: string;
}

function layout(b: Block & { subject: string; preheader?: string }, cfg: EmailConfig): Rendered {
  const logo = `${cfg.appUrl}/brand/insight-logo-light.png`;
  const detailsHtml = b.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${HONEYDEW};border:1px solid #D7EBD9;border-radius:8px">${b.details
        .map(([k, v]) => `<tr><td style="padding:9px 14px;font-size:13px;color:${MUTED};width:38%">${esc(k)}</td><td style="padding:9px 14px;font-size:14px;color:${INK};font-weight:600">${esc(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  const ctaHtml = b.cta
    ? `<p style="margin:24px 0"><a href="${esc(b.cta.url)}" style="background:${GREEN};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;display:inline-block">${esc(b.cta.label)}</a></p><p style="margin:0 0 6px;font-size:12px;color:${MUTED};word-break:break-all">If the button does not work, copy this link into your browser:<br>${esc(b.cta.url)}</p>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.subject)}</title></head>
<body style="margin:0;padding:0;background:${HONEYDEW};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(b.preheader ?? b.paragraphs[0] ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${HONEYDEW};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #D7EBD9">
<tr><td style="background:${DEEP};padding:18px 28px"><img src="${esc(logo)}" alt="Insight" height="34" style="display:block;border:0;height:34px"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px;color:${DEEP}">${esc(b.heading)}</h1>
${b.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14.5px;line-height:1.6;color:${INK}">${esc(p)}</p>`).join("")}
${detailsHtml}${ctaHtml}
${b.note ? `<p style="margin:14px 0 0;font-size:12.5px;line-height:1.5;color:${MUTED}">${esc(b.note)}</p>` : ""}
</td></tr>
<tr><td style="background:${HONEYDEW};padding:16px 28px;border-top:1px solid #D7EBD9;font-size:12px;line-height:1.6;color:${MUTED}">
<strong style="color:${DEEP}">Insight</strong> &middot; inventory, sales and marketplace for retail businesses.<br>
Questions? Contact us at <a href="mailto:${esc(cfg.contactAddress)}" style="color:${GREEN}">${esc(cfg.contactAddress)}</a>.<br>
<a href="${esc(cfg.appUrl)}" style="color:${GREEN}">${esc(cfg.appUrl.replace(/^https?:\/\//, ""))}</a>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    b.heading,
    "",
    ...b.paragraphs.flatMap((p) => [p, ""]),
    ...(b.details?.length ? [...b.details.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(b.cta ? [`${b.cta.label}: ${b.cta.url}`, ""] : []),
    ...(b.note ? [b.note, ""] : []),
    "--",
    "Insight",
    `Questions? Contact us at ${cfg.contactAddress}`,
    cfg.appUrl,
  ].join("\n");
  return { subject: b.subject, html, text };
}

// ----------------------------------------------------------------------------
// Template catalogue. Each template takes plain, non-secret data (a token link
// is passed in by the caller at send time and is never stored).
// ----------------------------------------------------------------------------

type D = Record<string, any>;
type TemplateFn = (d: D, cfg: EmailConfig) => Rendered;

const money = (v: unknown, cur?: string) => `${cur ?? "GHS"} ${Number(v ?? 0).toFixed(2)}`;

export const TEMPLATES: Record<string, TemplateFn> = {
  welcome: (d, c) => layout({ subject: "Welcome to Insight", heading: `Welcome, ${d.name}`, paragraphs: [`Your Insight account for ${d.businessName} has been created.`, "Choose your package to continue. Some packages need approval before the dashboard opens."], cta: { label: "Open Insight", url: appLink("/login", c) } }, c),
  verify_email: (d, c) => layout({ subject: "Confirm your email address", heading: "Confirm your email address", paragraphs: [`Hello ${d.name}, please confirm that this email address belongs to you.`, `This link works once and expires in ${d.expiresInHours ?? 24} hours.`], cta: { label: "Confirm email address", url: d.url }, note: "If you did not create an Insight account you can ignore this email." }, c),
  password_reset: (d, c) => layout({ subject: "Reset your Insight password", heading: "Reset your password", paragraphs: ["We received a request to reset the password for your account.", `This link works once and expires in ${d.expiresInMinutes ?? 30} minutes.`], cta: { label: "Choose a new password", url: d.url }, note: "If you did not ask for this, ignore this email. Your password stays the same." }, c),
  password_changed: (d, c) => layout({ subject: "Your Insight password was changed", heading: "Your password was changed", paragraphs: [`The password for your account was changed on ${d.when}.`, "If this was not you, reset your password now and contact us."], cta: { label: "Reset password", url: appLink("/login", c) } }, c),
  security_login_attempts: (d, c) => layout({ subject: "Repeated failed sign-in attempts", heading: "Repeated failed sign-in attempts", paragraphs: [`There were several failed attempts to sign in to your account. Sign-in is paused for ${d.minutes ?? 15} minutes.`, "If this was you, wait and try again. If not, reset your password to be safe."], cta: { label: "Go to sign in", url: appLink("/login", c) } }, c),
  employee_invite: (d, c) => layout({ subject: `You have been added to ${d.businessName} on Insight`, heading: "You have been added to a team", paragraphs: [`${d.inviterName} added you to ${d.businessName} as ${d.roleLabel}.`, "Sign in with the email address this message was sent to and the password you were given."], cta: { label: "Sign in", url: appLink("/login", c) } }, c),
  low_stock: (d, c) => layout({ subject: `Low stock: ${d.productName}`, heading: "Low stock alert", paragraphs: [`${d.productName} is running low at ${d.businessName}.`], details: [["Product", d.productName], ["Left", String(d.quantity)], ["Minimum", String(d.minimum)]], cta: { label: "View inventory", url: appLink("/inventory", c) }, note: "Turn these emails off in Settings, Notifications." }, c),
  out_of_stock: (d, c) => layout({ subject: `Out of stock: ${d.productName}`, heading: "Out of stock", paragraphs: [`${d.productName} has no stock left across your branches.`], cta: { label: "View inventory", url: appLink("/inventory", c) }, note: "Turn these emails off in Settings, Notifications." }, c),
  sales_summary: (d, c) => layout({ subject: `Sales summary for ${d.period}`, heading: "Sales summary", paragraphs: [`Here is how ${d.businessName} did for ${d.period}.`], details: [["Sales", String(d.count)], ["Revenue", money(d.revenue, d.currency)]], cta: { label: "Open reports", url: appLink("/reports", c) }, note: "Turn these emails off in Settings, Notifications." }, c),
  purchase_order: (d, c) => layout({ subject: `Purchase order ${d.reference} recorded`, heading: "Purchase order recorded", paragraphs: [`A purchase order was recorded for ${d.businessName}.`], details: [["Reference", d.reference], ["Supplier", d.supplier], ["Total", money(d.total, d.currency)]], cta: { label: "View purchases", url: appLink("/purchases", c) }, note: "Turn these emails off in Settings, Notifications." }, c),
  seller_application_submitted: (d, c) => layout({ subject: "We received your seller application", heading: "Application received", paragraphs: [`Your Insight Store application for ${d.businessName} was submitted.`, `Reviews take ${d.window ?? "2 to 18 days"}. We will email you when the status changes. Submitting does not guarantee approval.`], cta: { label: "View application status", url: appLink("/apply", c) } }, c),
  seller_application_status: (d, c) => {
    const lead: Record<string, string> = {
      UNDER_REVIEW: "Your application is now under review.",
      INFO_REQUIRED: "We need more information before we can continue.",
      APPROVED: "Your application was approved. Your dashboard is now unlocked.",
      REJECTED: "Your application was not approved.",
    };
    const title: Record<string, string> = { UNDER_REVIEW: "Application under review", INFO_REQUIRED: "More information needed", APPROVED: "Application approved", REJECTED: "Application not approved" };
    return layout({ subject: `Seller application: ${title[d.status] ?? "status update"}`, heading: title[d.status] ?? "Application update", paragraphs: [lead[d.status] ?? "Your application status changed.", ...(d.note ? [`Note from the review team: ${d.note}`] : [])], cta: { label: "View application", url: appLink(d.status === "APPROVED" ? "/dashboard" : "/apply", c) } }, c);
  },
  seller_new_order: (d, c) => layout({ subject: `New order request ${d.reference}`, heading: "New order request", paragraphs: [`A customer sent an order request to ${d.businessName} through the Insight Store.`, "This is a request, not a confirmed sale. Contact the customer to agree payment and delivery. Insight does not collect payment or confirm fulfilment."], details: [["Reference", d.reference], ["Items", String(d.items)], ["Total", money(d.total, d.currency)]], cta: { label: "Open orders", url: appLink("/seller", c) } }, c),
  seller_order_status: (d, c) => layout({ subject: `Order ${d.reference} updated`, heading: "Order status updated", paragraphs: [`Order request ${d.reference} is now marked ${d.statusLabel}.`], cta: { label: "Open orders", url: appLink("/seller", c) } }, c),
  admin_new_application: (d, c) => layout({ subject: "New seller application", heading: "New seller application", paragraphs: [`${d.businessName} submitted a seller application.`], cta: { label: "Review applications", url: appLink("/admin/store", c) } }, c),
  admin_security_event: (d, c) => layout({ subject: `Security event: ${d.event}`, heading: "Security event", paragraphs: [String(d.event), ...(d.detail ? [String(d.detail)] : [])], cta: { label: "Open admin console", url: appLink("/admin", c) } }, c),
  admin_system_failure: (d, c) => layout({ subject: `System failure: ${d.event}`, heading: "System failure", paragraphs: [String(d.event), ...(d.detail ? [String(d.detail)] : [])], cta: { label: "Open admin console", url: appLink("/admin", c) } }, c),
  admin_compliance_event: (d, c) => layout({ subject: `Compliance event: ${d.event}`, heading: "Compliance event", paragraphs: [String(d.event), ...(d.detail ? [String(d.detail)] : [])] }, c),
  admin_delivery_failure: (d, c) => layout({ subject: "Email delivery problem", heading: "Email delivery problem", paragraphs: [`An email in the ${d.category} category ended as ${d.status}.`, "Open the admin Email section for details."], cta: { label: "Open Email section", url: appLink("/admin/email", c) } }, c),
  admin_test: (d, c) => layout({ subject: "Insight test email", heading: "Test email", paragraphs: ["This is a test message sent from the Insight admin console.", `Sent at ${d.when}.`] }, c),
  contact_message: (d, c) => layout({ subject: `Contact form: ${d.subject}`, heading: "New contact form message", paragraphs: [`From: ${d.name} <${d.email}>`, ...String(d.message).split(/\n{2,}/).filter(Boolean)], note: "Reply to this email to answer the sender directly." }, c),
  contact_receipt: (d, c) => layout({ subject: "We received your message", heading: "Message received", paragraphs: [`Hello ${d.name}, thank you for contacting Insight.`, "We read every message and will reply to this email address."] }, c),
};

export function render(template: string, data: D, cfg: EmailConfig = emailConfig()): Rendered {
  const fn = TEMPLATES[template];
  if (!fn) throw new Error(`Unknown email template: ${template}`);
  return fn(data, cfg);
}
