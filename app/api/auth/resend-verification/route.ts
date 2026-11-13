import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { sendVerificationEmail } from "@/lib/email/flows";
import { rateLimited } from "@/lib/rate-limit";

// Signed-in users only, so this reveals nothing about other addresses.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, emailVerifiedAt: true } });
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ message: "Your email address is already confirmed." });
  if (await rateLimited(`verify:resend:${user.id}`, 3, 60 * 60_000)) return NextResponse.json({ error: "Please wait before requesting another email." }, { status: 429 });
  const out = await sendVerificationEmail(user.id);
  if (out === "off") return NextResponse.json({ error: "Email is not available right now. Please try again later." }, { status: 503 });
  if (out === "failed") return NextResponse.json({ error: "We could not send the email. Please try again later." }, { status: 502 });
  return NextResponse.json({ message: "We sent a new confirmation link." });
}
