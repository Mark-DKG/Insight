import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { adminEmailStatus } from "@/lib/email/admin-status";
import { isEmailAddress } from "@/lib/email/config";

export async function GET() {
  const ctx = await requireAdmin("system.monitor");
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ ...(await adminEmailStatus()), canManage: ctx.permissions.includes("settings.manage") });
}

const Schema = z.object({
  enabled: z.boolean().optional(),
  // null clears the override (falls back to EMAIL_ADMIN_ADDRESS / EMAIL_CONTACT_ADDRESS).
  centralAddress: z.string().trim().toLowerCase().max(254).nullable().optional(),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)."),
});

// Only administrators with settings.manage (Super Admins by default) can change these.
export async function PATCH(request: Request) {
  const ctx = await requireAdmin("settings.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  const { reason, enabled, centralAddress } = parsed.data;
  if (centralAddress && !isEmailAddress(centralAddress)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (enabled === undefined && centralAddress === undefined) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const before = await prisma.emailSetting.findUnique({ where: { id: "default" } });
  const data = { ...(enabled !== undefined ? { enabled } : {}), ...(centralAddress !== undefined ? { centralAddress: centralAddress || null } : {}), updatedBy: ctx.admin.email };
  await prisma.$transaction(async (tx) => {
    await tx.emailSetting.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
    await platformAudit(ctx, { action: "EMAIL_SETTINGS_UPDATED", targetType: "EmailSetting", targetId: "default", reason, before: { enabled: before?.enabled ?? true, centralAddress: before?.centralAddress ?? null }, after: { enabled: enabled ?? before?.enabled ?? true, centralAddress: centralAddress === undefined ? before?.centralAddress ?? null : centralAddress || null } }, tx);
  });
  return NextResponse.json(await adminEmailStatus());
}
