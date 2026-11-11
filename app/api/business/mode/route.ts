import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { disabledModules, PACKAGE_LABEL, packageIncludesStore, type AppMode } from "@/lib/features";
import { OPEN_APPLICATION_STATUSES } from "@/lib/store/core";
import { uniqueReference, actorLabel } from "@/lib/store/server";

// GET /api/business/mode — the active package for the caller's business. Any
// signed-in user may read it (the UI needs it to build navigation).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: { appMode: true, pendingAppMode: true, storeSeller: { select: { status: true } } },
  });
  const mode = (business?.appMode ?? "FULL") as AppMode;
  return NextResponse.json({
    mode,
    label: PACKAGE_LABEL[mode],
    pendingMode: business?.pendingAppMode ?? null,
    disabledModules: disabledModules(mode),
    sellerStatus: business?.storeSeller?.status ?? null,
    canChange: requirePermission(session, "settings.manage_application_mode"),
  });
}

const Schema = z.object({
  mode: z.enum(["FULL", "INVENTORY_ONLY", "STORE_INVENTORY", "POS_INVENTORY"]),
  confirm: z.literal(true, { errorMap: () => ({ message: "Confirm the package change to continue." }) }),
});

// PUT /api/business/mode — change package. Owner only (checked here, not just
// hidden in the UI). Records are never deleted; disabled modules are only
// blocked. Store and Inventory needs an approved seller: without one the
// request is held as pendingAppMode, a seller application is opened, and the
// package is applied when the Insight Store team approves the application.
export async function PUT(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "settings.manage_application_mode")) {
    return NextResponse.json({ error: "Only the business owner can change the package." }, { status: 403 });
  }
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const next = parsed.data.mode as AppMode;
  const label = await actorLabel(session);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.business.findUnique({
        where: { id: session.businessId },
        select: { appMode: true, pendingAppMode: true, storeSeller: { select: { status: true } } },
      });
      if (!current) throw new Error("Business not found.");
      const approved = !!current.storeSeller;

      // Store and Inventory without approval → hold and open an application.
      if (next === "STORE_INVENTORY" && !approved) {
        let app = await tx.storeSellerApplication.findFirst({
          where: { businessId: session.businessId, status: { in: OPEN_APPLICATION_STATUSES } },
        });
        if (!app) {
          const business = await tx.business.findUnique({ where: { id: session.businessId }, select: { name: true, phone: true, email: true, address: true } });
          const owner = await tx.user.findUnique({ where: { id: session.sub }, select: { name: true, email: true } });
          const reference = await uniqueReference("SA", async (ref) => !!(await tx.storeSellerApplication.findUnique({ where: { reference: ref } })));
          app = await tx.storeSellerApplication.create({
            data: {
              reference, businessId: session.businessId, applicantUserId: session.sub, requestedAppMode: "STORE_INVENTORY",
              data: { registeredName: business?.name ?? "", phone: business?.phone ?? "", email: business?.email ?? "", address: business?.address ?? "", country: "Ghana", repName: owner?.name ?? "", repEmail: owner?.email ?? "", offersCollection: true },
              events: { create: { actorType: "BUSINESS_USER", actorId: session.sub, actorLabel: label, action: "CREATED", toStatus: "DRAFT", note: "Started from a Store and Inventory package request." } },
            },
          });
        } else {
          await tx.storeSellerApplication.update({ where: { id: app.id }, data: { requestedAppMode: "STORE_INVENTORY" } });
        }
        await tx.business.update({ where: { id: session.businessId }, data: { pendingAppMode: "STORE_INVENTORY" } });
        await tx.auditLog.create({
          data: {
            businessId: session.businessId, userId: session.sub, branchId: session.branchId, action: "APP_MODE_CHANGE_REQUESTED",
            entityType: "Business", entityId: session.businessId,
            previousValue: { appMode: current.appMode }, newValue: { pendingAppMode: next, applicationId: app.id },
          },
        });
        return { previous: current.appMode, mode: current.appMode, changed: false, pending: next, applicationId: app.id };
      }

      if (current.appMode === next && !current.pendingAppMode) {
        return { previous: current.appMode, mode: next, changed: false, pending: null, applicationId: null };
      }
      await tx.business.update({ where: { id: session.businessId }, data: { appMode: next, pendingAppMode: null } });
      await tx.auditLog.create({
        data: {
          businessId: session.businessId, userId: session.sub, branchId: session.branchId, action: "APP_MODE_CHANGED",
          entityType: "Business", entityId: session.businessId,
          previousValue: { appMode: current.appMode, pendingAppMode: current.pendingAppMode }, newValue: { appMode: next },
        },
      });
      return { previous: current.appMode, mode: next, changed: current.appMode !== next, pending: null, applicationId: null };
    });

    const mode = result.mode as AppMode;
    let note: string | null = null;
    if (result.pending) {
      note = "Store and Inventory needs Insight Store seller approval. Complete and submit your seller application; the package switches automatically once it is approved.";
    } else if (packageIncludesStore(mode)) {
      const seller = await prisma.storeSeller.findUnique({ where: { businessId: session.businessId }, select: { id: true } });
      if (!seller) note = "This package includes Insight Store. To sell on Insight Store, apply in Settings → Business Configuration → Insight Store.";
    } else if (packageIncludesStore(result.previous as AppMode)) {
      const live = await prisma.storeListing.count({ where: { businessId: session.businessId, status: "PUBLISHED" } });
      if (live) note = `Your ${live} published Insight Store listing${live === 1 ? " is" : "s are"} hidden from the marketplace while you are on this package. They come back if you switch to a package that includes Insight Store.`;
    }
    return NextResponse.json({ ...result, label: PACKAGE_LABEL[mode], disabledModules: disabledModules(mode), note });
  } catch (error) {
    console.error("Package change failed:", error);
    return NextResponse.json({ error: "The package could not be changed. Your business is still on its previous package." }, { status: 500 });
  }
}
