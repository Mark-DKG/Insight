import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET /api/business — business profile (any signed-in user).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.locked) {
    return NextResponse.json({ error: "Your account is waiting for Insight Store approval.", code: "AWAITING_APPROVAL" }, { status: 403 });
  }
  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: { id: true, name: true, address: true, phone: true, email: true, currency: true, taxRate: true },
  });
  return NextResponse.json({ business });
}

const UpdateSchema = z.object({
  name: z.string().trim().min(2, "Business name is too short.").optional(),
  address: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().email("Enter a valid email address.").nullable().optional().or(z.literal("")),
  currency: z.string().trim().min(3).max(3).optional(),
  taxRate: z.number().min(0).max(100).optional(),
});

// PATCH /api/business — Owners only (settings:write).
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "settings:write")) {
    return NextResponse.json({ error: "Only the business owner can change these settings." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  }

  const { email, currency, ...rest } = parsed.data;
  const before = await prisma.business.findUnique({ where: { id: session.businessId } });
  const business = await prisma.business.update({
    where: { id: session.businessId },
    data: {
      ...rest,
      ...(email !== undefined ? { email: email || null } : {}),
      ...(currency ? { currency: currency.toUpperCase() } : {}),
    },
    select: { id: true, name: true, address: true, phone: true, email: true, currency: true, taxRate: true },
  });

  await prisma.auditLog.create({
    data: {
      businessId: session.businessId,
      userId: session.sub,
      action: "BUSINESS_UPDATED",
      entityType: "Business",
      entityId: session.businessId,
      previousValue: before ? { name: before.name, currency: before.currency, taxRate: before.taxRate.toString() } : undefined,
      newValue: { name: business.name, currency: business.currency, taxRate: business.taxRate.toString() },
    },
  });

  return NextResponse.json({ business });
}
