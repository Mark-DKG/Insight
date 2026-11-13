import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { readPrefs } from "@/lib/email/preferences";

export async function GET() {
  const session = await getSession();
  if (!requirePermission(session, "settings:read")) return NextResponse.json({ error: "You don't have permission to view settings." }, { status: 403 });
  const b = await prisma.business.findUnique({ where: { id: session.businessId }, select: { settings: true } });
  return NextResponse.json({ preferences: readPrefs(b?.settings), alwaysOn: ["Email confirmation", "Password reset", "Password changed", "Security alerts", "Seller application status"] });
}

const Schema = z.object({ lowStock: z.boolean().optional(), salesSummary: z.boolean().optional(), purchaseOrders: z.boolean().optional(), marketplace: z.boolean().optional() }).strict();

// Owners only. Each change is recorded in the audit log.
export async function PUT(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "settings:write")) return NextResponse.json({ error: "Only the business owner can change email preferences." }, { status: 403 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email preferences." }, { status: 400 });
  const b = await prisma.business.findUnique({ where: { id: session.businessId }, select: { settings: true } });
  const before = readPrefs(b?.settings);
  const after = { ...before, ...parsed.data };
  const settings = { ...((b?.settings && typeof b.settings === "object" ? b.settings : {}) as Record<string, unknown>), emailNotifications: after };
  await prisma.$transaction([
    prisma.business.update({ where: { id: session.businessId }, data: { settings } }),
    prisma.auditLog.create({ data: { businessId: session.businessId, userId: session.sub, action: "EMAIL_PREFERENCES_UPDATED", entityType: "Business", entityId: session.businessId, previousValue: before, newValue: after } }),
  ]);
  return NextResponse.json({ preferences: after });
}
