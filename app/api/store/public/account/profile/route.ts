import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { currentShopper, endSession, toPublic } from "@/lib/store/shopper";
import { normalizeWhatsApp } from "@/lib/store/core";

const Patch = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  defaultAddress: z.string().trim().max(500).optional().or(z.literal("")),
});

// PATCH /api/store/public/account/profile — name, phone and saved delivery address.
export async function PATCH(request: Request) {
  const s = await currentShopper();
  if (!s) return NextResponse.json({ error: "Sign in to manage your account." }, { status: 401 });
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
  let phone: string | null = null;
  if (parsed.data.phone) {
    phone = normalizeWhatsApp(parsed.data.phone);
    if (!phone) return NextResponse.json({ error: "Enter a valid phone number, e.g. 024 123 4567, or leave it blank." }, { status: 400 });
  }
  const updated = await prisma.storeShopper.update({
    where: { id: s.id },
    data: { name: parsed.data.name, phone, defaultAddress: parsed.data.defaultAddress || null },
  });
  return NextResponse.json({ shopper: toPublic(updated) }, { headers: { "Cache-Control": "no-store" } });
}

// DELETE /api/store/public/account/profile — { password }. Deletes the account
// and its sessions. Past orders stay with their sellers as ordinary guest-style
// records (they keep the name and phone the customer typed at checkout).
export async function DELETE(request: Request) {
  const s = await currentShopper();
  if (!s) return NextResponse.json({ error: "Sign in to manage your account." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.password !== "string" || !(await verifyPassword(body.password, s.passwordHash))) {
    return NextResponse.json({ error: "Enter your current password to delete your account." }, { status: 403 });
  }
  await prisma.storeShopper.delete({ where: { id: s.id } });
  await endSession();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
