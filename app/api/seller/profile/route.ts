import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { requireSeller, sellerState } from "@/lib/store/server";
import { normalizeWhatsApp } from "@/lib/store/core";

// GET /api/seller/profile — the seller's public store profile and the
// branches it can fulfil from. Readable while suspended (so the seller can
// see why), editable only while allowed to sell.
export async function GET() {
  const session = await getSession();
  if (!requirePermission(session, "store:read")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const state = await sellerState(session.businessId);
  if (!state.seller) return NextResponse.json({ error: state.blockedReason, code: "STORE_NOT_AVAILABLE" }, { status: 403 });
  const branches = await prisma.branch.findMany({ where: { businessId: session.businessId, isActive: true }, select: { id: true, name: true, isMain: true }, orderBy: [{ isMain: "desc" }, { name: "asc" }] });
  return NextResponse.json({
    seller: state.seller, businessName: state.business?.name, canSell: state.canSell, blockedReason: state.canSell ? null : state.blockedReason,
    branches, canManage: requirePermission(session, "store:manage"),
  });
}

const opt = (max: number) => z.string().trim().max(max).optional().nullable();
const Schema = z.object({
  description: opt(2000),
  city: opt(80), region: opt(80), country: opt(80),
  publicPhone: opt(40),
  whatsappNumber: opt(40),
  publicEmail: z.string().trim().email("Enter a valid public email.").max(160).optional().nullable().or(z.literal("")),
  openingHours: opt(300),
  offersDelivery: z.boolean().optional(),
  deliveryInfo: opt(500),
  offersCollection: z.boolean().optional(),
  collectionInfo: opt(500),
  fulfilmentBranchId: z.string().uuid().optional().nullable(),
}).strict();

export async function PATCH(request: Request) {
  const g = await requireSeller(await getSession(), "store:manage");
  if (g instanceof NextResponse) return g;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile." }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) data[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  if (d.whatsappNumber) {
    const n = normalizeWhatsApp(d.whatsappNumber);
    if (!n) return NextResponse.json({ error: "Enter a valid WhatsApp number, e.g. 024 123 4567 or +233 24 123 4567." }, { status: 400 });
    data.whatsappNumber = n;
  }
  if (d.fulfilmentBranchId) {
    const ok = await prisma.branch.findFirst({ where: { id: d.fulfilmentBranchId, businessId: g.session.businessId, isActive: true } });
    if (!ok) return NextResponse.json({ error: "Choose one of your active branches." }, { status: 400 });
  }
  const next = { offersDelivery: g.seller.offersDelivery, offersCollection: g.seller.offersCollection, ...data };
  if (!next.offersDelivery && !next.offersCollection) {
    return NextResponse.json({ error: "Offer at least one of delivery or collection." }, { status: 400 });
  }
  const seller = await prisma.storeSeller.update({ where: { id: g.seller.id }, data });
  await prisma.auditLog.create({
    data: { businessId: g.session.businessId, userId: g.session.sub, branchId: g.session.branchId, action: "STORE_PROFILE_UPDATED", entityType: "StoreSeller", entityId: seller.id, newValue: data as object },
  });
  return NextResponse.json({ seller });
}
