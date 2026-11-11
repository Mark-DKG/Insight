import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { actorLabel } from "@/lib/store/server";
import { applicationTransition, type ApplicationStatus } from "@/lib/store/core";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:apply")) {
    return NextResponse.json({ error: "Only the business owner can withdraw the application." }, { status: 403 });
  }
  const app = await prisma.storeSellerApplication.findFirst({ where: { id: params.id, businessId: session.businessId } });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const to = applicationTransition("withdraw", app.status as ApplicationStatus, "business");
  if (!to) return NextResponse.json({ error: "This application can no longer be withdrawn." }, { status: 409 });

  await prisma.$transaction([
    prisma.storeSellerApplication.update({ where: { id: app.id }, data: { status: to } }),
    prisma.storeApplicationEvent.create({
      data: { applicationId: app.id, actorType: "BUSINESS_USER", actorId: session.sub, actorLabel: await actorLabel(session), action: "WITHDRAWN", fromStatus: app.status, toStatus: to },
    }),
    // A withdrawn application cancels any package change that was waiting on it.
    prisma.business.update({ where: { id: session.businessId }, data: { pendingAppMode: null } }),
  ]);
  return NextResponse.json({ ok: true });
}
