import { stripCrlf, isEmailAddress } from "./config";

// Contact form validation, kept pure so it can be unit tested. Header injection
// is blocked two ways: line breaks are rejected in single-line fields, and the
// values are only ever placed in the body/Reply-To through the provider's JSON
// API (never concatenated into raw headers).

export interface ContactInput { name: string; email: string; subject: string; message: string; website?: string }
export type ContactCheck = { ok: true; value: { name: string; email: string; subject: string; message: string } } | { ok: false; error: string; spam?: boolean };

const hasBreak = (v: string) => /[\r\n\u2028\u2029]/.test(v);

export function checkContact(i: Partial<ContactInput>): ContactCheck {
  // Honeypot: real people never fill the hidden "website" field.
  if (typeof i.website === "string" && i.website.trim() !== "") return { ok: false, error: "Message could not be sent.", spam: true };
  const name = typeof i.name === "string" ? i.name.trim() : "";
  const email = typeof i.email === "string" ? i.email.trim().toLowerCase() : "";
  const subject = typeof i.subject === "string" ? i.subject.trim() : "";
  const message = typeof i.message === "string" ? i.message.trim() : "";
  if (name.length < 2 || name.length > 100) return { ok: false, error: "Enter your name." };
  if (hasBreak(name) || hasBreak(email) || hasBreak(subject)) return { ok: false, error: "Names, emails and subjects cannot contain line breaks." };
  if (!isEmailAddress(email)) return { ok: false, error: "Enter a valid email address." };
  if (subject.length < 3 || subject.length > 150) return { ok: false, error: "Enter a subject (3 to 150 characters)." };
  if (message.length < 10 || message.length > 5000) return { ok: false, error: "Write a message of 10 to 5000 characters." };
  // Links are the common spam signal: more than three is refused.
  if ((message.match(/https?:\/\//gi) ?? []).length > 3) return { ok: false, error: "Please remove some links from your message.", spam: true };
  return { ok: true, value: { name: stripCrlf(name), email, subject: stripCrlf(subject), message } };
}
