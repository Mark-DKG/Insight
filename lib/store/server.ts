import { NextResponse } from "next/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionClaims } from "@/lib/auth";
import { requirePermission, type Permission } from "@/lib/rbac";
import { getAppMode, isModuleEnabled, PACKAGE_LABEL, type AppMode } from "@/lib/features";
import { randomRef, sniffMime, safeFileName } from "./core";

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Seller eligibility: a business can sell on Insight Store only when its
// package includes Store AND it has an active (approved, not suspended)
// seller record. Both are checked on the server for every seller API call.
// ---------------------------------------------------------------------------

export async function sellerState(businessId: string) {
  const [business, seller, latestApplication] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { appMode: true, pendingAppMode: true, name: true, status: true } }),
    prisma.storeSeller.findUnique({ where: { businessId } }),
    prisma.storeSellerApplication.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" } }),
  ]);
  const mode = (business?.appMode ?? "FULL") as AppMode;
  const packageAllows = isModuleEnabled(mode, "store");
  const approved = !!seller;
  const active = seller?.status === "ACTIVE";
  let blockedReason: string | null = null;
  if (!approved) blockedReason = "Your business has not been approved as an Insight Store seller yet.";
  else if (!active) blockedReason = `Insight Store selling is suspended for your business${seller?.suspendedReason ? `: ${seller.suspendedReason}` : "."}`;
  else if (!packageAllows) blockedReason = `Insight Store selling is not included in your ${PACKAGE_LABEL[mode]} package.`;
  return { business, mode, packageAllows, seller, latestApplication, canSell: approved && active && packageAllows, blockedReason };
}

/**
 * Guard for seller APIs. Returns the seller context or an error response.
 *   const g = await requireSeller(session, "store:manage");
 *   if (g instanceof NextResponse) return g;
 */
export async function requireSeller(session: SessionClaims | null, permission: Permission) {
  if (!requirePermission(session, permission)) {
    return NextResponse.json({ error: "You don't have permission for Insight Store actions." }, { status: 403 });
  }
  const state = await sellerState(session.businessId);
  if (!state.canSell || !state.seller) {
    return NextResponse.json({ error: state.blockedReason ?? "Insight Store is not available.", code: "STORE_NOT_AVAILABLE" }, { status: 403 });
  }
  return { session, seller: state.seller, mode: state.mode };
}

/** The branch whose stock backs marketplace availability for a seller. */
export async function fulfilmentBranchId(businessId: string, preferred?: string | null, db: Db = prisma): Promise<string | null> {
  if (preferred) {
    const ok = await db.branch.findFirst({ where: { id: preferred, businessId, isActive: true }, select: { id: true } });
    if (ok) return ok.id;
  }
  const main = await db.branch.findFirst({ where: { businessId, isActive: true }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true } });
  return main?.id ?? null;
}

/** Live availability per product at each seller's fulfilment branch. */
export async function availabilityFor(items: { productId: string; businessId: string }[], db: Db = prisma) {
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  const businessIds = [...new Set(items.map((i) => i.businessId))];
  const sellers = await db.storeSeller.findMany({ where: { businessId: { in: businessIds } }, select: { businessId: true, fulfilmentBranchId: true } });
  const branchByBusiness = new Map<string, string | null>();
  for (const b of businessIds) {
    const pref = sellers.find((s) => s.businessId === b)?.fulfilmentBranchId ?? null;
    branchByBusiness.set(b, await fulfilmentBranchId(b, pref, db));
  }
  const levels = await db.inventoryLevel.findMany({
    where: { productId: { in: items.map((i) => i.productId) } },
    select: { productId: true, branchId: true, quantity: true, product: { select: { businessId: true } } },
  });
  for (const i of items) out.set(i.productId, 0);
  for (const l of levels) {
    if (branchByBusiness.get(l.product.businessId) === l.branchId) out.set(l.productId, Math.max(0, l.quantity));
  }
  return out;
}

/** Orders still NEW past their expiry become EXPIRED (no stock is held by NEW orders). */
export async function expireStaleOrders(where: Prisma.StoreOrderWhereInput = {}) {
  const stale = await prisma.storeOrder.findMany({
    where: { ...where, status: "NEW", expiresAt: { lt: new Date() } },
    select: { id: true },
    take: 200,
  });
  if (stale.length === 0) return 0;
  const ids = stale.map((s) => s.id);
  await prisma.$transaction([
    prisma.storeOrder.updateMany({ where: { id: { in: ids }, status: "NEW" }, data: { status: "EXPIRED" } }),
    prisma.storeOrderEvent.createMany({
      data: ids.map((orderId) => ({ orderId, actorType: "SYSTEM", actorLabel: "System", fromStatus: "NEW", toStatus: "EXPIRED", action: "EXPIRED", note: "No seller response before the request expired." })),
    }),
  ]);
  return ids.length;
}

export async function uniqueReference(prefix: string, exists: (ref: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const ref = randomRef(prefix);
    if (!(await exists(ref))) return ref;
  }
  throw new Error("Could not allocate a unique reference.");
}

export async function actorLabel(session: SessionClaims): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: session.sub }, select: { name: true } });
  return u?.name ?? session.email;
}

export async function getStoreConfig() {
  return (
    (await prisma.storeConfig.findUnique({ where: { id: "default" } })) ?? {
      id: "default", isOpen: true, announcement: null, policies: null, orderExpiryHours: 48, requiredDocuments: [], updatedAt: new Date(),
    }
  );
}

/** Reads one uploaded file from multipart form data and validates it by content. */
export async function readUpload(request: Request, opts: { maxBytes: number; types: string[] }) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return { error: "Choose a file to upload." } as const;
  if (file.size === 0) return { error: "The file is empty." } as const;
  if (file.size > opts.maxBytes) return { error: `The file is too large (maximum ${Math.round(opts.maxBytes / 1024 / 1024)} MB).` } as const;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || !opts.types.includes(mime)) {
    return { error: `Unsupported file type. Allowed: ${opts.types.map((t) => t.split("/")[1].toUpperCase()).join(", ")}.` } as const;
  }
  return { bytes, mime, name: safeFileName(file.name), form } as const;
}
