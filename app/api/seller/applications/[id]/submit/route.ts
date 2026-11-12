import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { actorLabel, getStoreConfig } from "@/lib/store/server";
import { applicationTransition, type ApplicationStatus } from "@/lib/store/core";
import { applicationProblems, missingDocuments, type Documents } from "@/lib/store/application-rules";
import { notifyBusiness, notifyPlatform } from "@/lib/notify";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:apply")) {
    return NextResponse.json({ error: "Only the business owner can submit the application." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const app = await prisma.storeSellerApplication.findFirst({
    where: { id: params.id, businessId: session.businessId },
    include: { documents: { select: { docKey: true } } },
  });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const to = applicationTransition("submit", app.status as ApplicationStatus, "business");
  if (!to) return NextResponse.json({ error: "This application cannot be submitted in its current state." }, { status: 409 });

  const data = (app.data ?? {}) as Record<string, unknown>;
  const problems = applicationProblems(data);
  if (Object.keys(problems).length) {
    return NextResponse.json({ error: Object.values(problems)[0], fields: problems }, { status: 400 });
  }
  const config = await getStoreConfig();
  const missingDocs = missingDocuments(data, config.requiredDocuments as Documents, app.documents.map((d) => d.docKey));
  if (missingDocs.length) {
    return NextResponse.json({ error: `Please upload: ${missingDocs.join(", ")}.` }, { status: 400 });
  }

  const response = typeof body?.response === "string" ? body.response.trim().slice(0, 2000) : "";
  const wasInfoRequest = app.status === "INFO_REQUIRED";
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.storeSellerApplication.updateMany({
      where: { id: app.id, status: app.status },
      data: { status: to, submittedAt: new Date(), infoRequest: wasInfoRequest ? app.infoRequest : null },
    });
    if (u.count !== 1) throw new Error("CONFLICT");
    await tx.storeApplicationEvent.create({
      data: {
        applicationId: app.id, actorType: "BUSINESS_USER", actorId: session.sub, actorLabel: await actorLabel(session),
        action: wasInfoRequest ? "RESUBMITTED" : "SUBMITTED", fromStatus: app.status, toStatus: to, note: response || null,
      },
    });
    await notifyPlatform({
      type: "STORE_APPLICATION",
      title: wasInfoRequest ? `Application ${app.reference} updated` : `New seller application ${app.reference}`,
      message: `${(app.data as { registeredName?: string }).registeredName ?? "A business"} ${wasInfoRequest ? "responded to your information request" : "applied to sell on Insight Store"}.`,
      link: `/admin/store/applications/${app.id}`,
      dedupeKey: `app:${app.id}:submitted:${Date.now()}`,
    }, tx);
    await notifyBusiness({
      businessId: session.businessId, type: "STORE_APPLICATION", roles: ["OWNER"],
      title: "Seller application submitted",
      message: `Application ${app.reference} has been sent to the Insight Store team for review.`,
      link: "/settings?section=store", dedupeKey: `app:${app.id}:submitted:${Date.now()}`,
    }, tx);
    return tx.storeSellerApplication.findUnique({ where: { id: app.id } });
  }).catch((e) => (e instanceof Error && e.message === "CONFLICT" ? null : Promise.reject(e)));

  if (!updated) return NextResponse.json({ error: "The application changed while you were submitting. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ application: updated });
}
