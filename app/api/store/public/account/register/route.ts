import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { normalizeEmail, passwordProblem } from "@/lib/store/shopper-core";
import { startSession, toPublic } from "@/lib/store/shopper";
import { normalizeWhatsApp } from "@/lib/store/core";

const Schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(160),
  password: z.string().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

// POST /api/store/public/account/register
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
  const d = parsed.data;
  const email = normalizeEmail(d.email);
  const problem = passwordProblem(d.password, email);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  let phone: string | null = null;
  if (d.phone) {
    phone = normalizeWhatsApp(d.phone);
    if (!phone) return NextResponse.json({ error: "Enter a valid phone number, e.g. 024 123 4567, or leave it blank." }, { status: 400 });
  }

  const exists = await prisma.storeShopper.findUnique({ where: { email }, select: { id: true } });
  if (exists) return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });

  try {
    const shopper = await prisma.storeShopper.create({
      data: { email, name: d.name, phone, passwordHash: await hashPassword(d.password), lastLoginAt: new Date() },
    });
    await startSession(shopper.id);
    return NextResponse.json({ shopper: toPublic(shopper) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
    console.error("Shopper register failed:", e);
    return NextResponse.json({ error: "Your account could not be created. Please try again." }, { status: 500 });
  }
}
