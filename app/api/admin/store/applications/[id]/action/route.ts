import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { applicationTransition, type ApplicationStatus } from "@/lib/store/core";
import { createSellerFromApplication } from "@/lib/store/approve";
import { notifyBusiness } from "@/lib/notify";

const Schema = z.object({
  action: z.enum(["start_review", "request_info", "approve", "reject", "note"]),
  message: z.string().trim().max(2000).optional(),
});

// POST /api/admin/store/applications/[id]/action
//   start_review | request_info (message to business) | approve | reject (reason)
//   note — internal note, never shown to the business
// Approval creates the seller record and applies any package the business
// requested; it does not publish any products.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { action } = parsed.data;
  const message = parsed.data.message ?? "";

  const app = await prisma.storeSellerApplication.findUnique({ where: { id: params.id }, include: { business: { select: { id: true, name: true, appMode: true, pendingAppMode: true, status: true } } } });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const actor = { actorType: "PLATFORM_ADMIN", actorId: ctx.admin.id, actorLabel: ctx.admin.name };

  if (action === "note") {
    if (message.length < 2) return NextResponse.json({ error: "Write the note first." }, { status: 400 });
    await prisma.storeApplicationEvent.create({ data: { applicationId: app.id, ...actor, action: "INTERNAL_NOTE", note: message, internal: true } });
    return NextResponse.json({ ok: true });
  }

  const from = app.status as ApplicationStatus;
  const to = applicationTransition(action, from, "admin");
  if (!to) return NextResponse.json({ error: `An application that is ${from.toLowerCase().replace("_", " ")} can't be ${action.replace("_", " ")}d.` }, { status: 409 });
  if ((action === "request_info" || action === "reject") && message.length < 5) {
    return NextResponse.json({ error: action === "reject" ? "Give the business a reason (at least 5 characters)." : "Tell the business what you need (at least 5 characters)." }, { status: 400 });
  }
  if (action === "approve") {
    if (app.business.status !== "ACTIVE") return NextResponse.json({ error: "The business account is suspended. Reactivate it before approving." }, { status: 409 });
    if (await prisma.storeSeller.findUnique({ where: { businessId: app.businessId } })) return NextResponse.json({ error: "This business is already a seller." }, { status: 409 });
  }

  const eventAction = { start_review: "REVIEW_STARTED", request_info: "INFO_REQUESTED", approve: "APPROVED", reject: "REJECTED" }[action];
  try {
    const result = await prisma.$transaction(async (tx) => {
      const u = await tx.storeSellerApplication.updateMany({
        where: { id: app.id, status: from },
        data: {
          status: to,
          ...(action === "request_info" ? { infoRequest: message } : {}),
          ...(action === "approve" || action === "reject" ? { decidedAt: new Date(), decidedByAdminId: ctx.admin.id, decisionReason: message || null } : {}),
        },
      });
      if (u.count !== 1) throw new Error("CONFLICT");
      await tx.storeApplicationEvent.create({ data: { applicationId: app.id, ...actor, action: eventAction, fromStatus: from, toStatus: to, note: message || null } });

      let seller = null;
      let packageApplied: string | null = null;
      if (action === "approve") {
        seller = await createSellerFromApplication(tx, app);
        const wanted = app.business.pendingAppMode ?? app.requestedAppMode;
        if (wanted && wanted !== app.business.appMode) {
          await tx.business.update({ where: { id: app.businessId }, data: { appMode: wanted, pendingAppMode: null } });
          await tx.auditLog.create({ data: { businessId: app.businessId, action: "APP_MODE_CHANGED", entityType: "Business", entityId: app.businessId, previousValue: { appMode: app.business.appMode }, newValue: { appMode: wanted, reason: `Insight Store application ${app.reference} approved` } } });
          packageApplied = wanted;
        } else if (app.business.pendingAppMode) {
          await tx.business.update({ where: { id: app.businessId }, data: { pendingAppMode: null } });
        }
      }
      if (action === "reject" && app.business.pendingAppMode) {
        await tx.business.update({ where: { id: app.businessId }, data: { pendingAppMode: null } });
      }

      const notice = {
        start_review: { title: "Your seller application is under review", message: `The Insight Store team has started reviewing application ${app.reference}.` },
        request_info: { title: "More information needed for your seller application", message: `The Insight Store team asked: ${message.slice(0, 300)}` },
        approve: { title: "You're approved to sell on Insight Store", message: `Application ${app.reference} was approved.${packageApplied ? " Your package has been updated." : ""} Next, list products from your inventory in the Insight Store seller area — each listing is reviewed before it goes live.` },
        reject: { title: "Your seller application was not approved", message: `Application ${app.reference}: ${message.slice(0, 300)}` },
      }[action];
      await notifyBusiness({ businessId: app.businessId, type: "STORE_APPLICATION", roles: ["OWNER"], ...notice, link: action === "approve" ? "/seller" : "/settings?section=store", dedupeKey: `app:${app.id}:${eventAction}:${Date.now()}` }, tx);
      await platformAudit(ctx, {
        action: `STORE_APPLICATION_${eventAction}`, targetBusinessId: app.businessId, targetType: "StoreSellerApplication", targetId: app.id,
        reason: message || null, before: { status: from, appMode: app.business.appMode }, after: { status: to, sellerId: seller?.id ?? null, packageApplied },
      }, tx);
      return { status: to, sellerId: seller?.id ?? null, packageApplied };
    }, { timeout: 20000, maxWait: 10000 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLICT") return NextResponse.json({ error: "The application changed while you were reviewing it. Refresh and try again." }, { status: 409 });
    console.error("Application action failed:", e);
    return NextResponse.json({ error: "The application could not be updated." }, { status: 500 });
  }
}
