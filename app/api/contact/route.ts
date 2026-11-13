import { NextResponse } from "next/server";
import { checkContact } from "@/lib/email/contact";
import { emailConfig } from "@/lib/email/config";
import { getEmailState, sendEmail } from "@/lib/email/service";
import { clientIp, rateLimited } from "@/lib/rate-limit";

// POST /api/contact — public contact form. Validated, rate limited, spam
// protected. Sends to the central address with the visitor as Reply-To. The
// answer is truthful: "sent" only when the provider accepted the message.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const check = checkContact(body ?? {});
  if (!check.ok) {
    // Spam gets a quiet success so bots learn nothing; nothing is sent.
    if (check.spam) return NextResponse.json({ ok: true, sent: false, message: "Thank you." });
    return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  }
  const ip = clientIp(request);
  if ((await rateLimited(`contact:ip:${ip}`, 5, 60 * 60_000)) || (await rateLimited(`contact:email:${check.value.email}`, 3, 60 * 60_000))) {
    return NextResponse.json({ ok: false, error: "You have sent several messages recently. Please try again later." }, { status: 429 });
  }
  const cfg = emailConfig();
  const state = await getEmailState(cfg);
  if (!state.enabled) {
    return NextResponse.json({ ok: false, unavailable: true, error: `Messages cannot be sent from this form right now. Please email ${state.centralAddress} directly.` }, { status: 503 });
  }
  const { name, email, subject, message } = check.value;
  const out = await sendEmail({ category: "contact", template: "contact_message", to: state.centralAddress, data: { name, email, subject, message }, key: `contact:${Date.now()}:${email}`, replyTo: email });
  if (out.result === "sent") return NextResponse.json({ ok: true, sent: true, message: "Your message was sent. We will reply to your email address." });
  if (out.result === "queued") return NextResponse.json({ ok: true, sent: false, queued: true, message: "Your message was received and is waiting to be delivered. We will reply to your email address." }, { status: 202 });
  return NextResponse.json({ ok: false, error: `We could not send your message. Please email ${state.centralAddress} directly.` }, { status: 502 });
}
