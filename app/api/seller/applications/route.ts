import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { actorLabel, uniqueReference } from "@/lib/store/server";
import { OPEN_APPLICATION_STATUSES } from "@/lib/store/core";

const Schema = z.object({ requestedAppMode: z.enum(["FULL", "STORE_INVENTORY"]).optional() });

// POST /api/seller/applications — start (or resume) a seller application.
// Only reachable from Settings → Insight Store or a package upgrade; ordinary
// registration never creates one.
export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "store:apply")) {
    return NextResponse.json({ error: "Only the business owner can apply to sell on Insight Store." }, { status: 403 });
  }
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const seller = await prisma.storeSeller.findUnique({ where: { businessId: session.businessId } });
  if (seller) return NextResponse.json({ error: "Your business is already an approved Insight Store seller." }, { status: 409 });

  const open = await prisma.storeSellerApplication.findFirst({
    where: { businessId: session.businessId, status: { in: OPEN_APPLICATION_STATUSES } },
  });
  if (open) {
    if (parsed.data.requestedAppMode && !open.requestedAppMode) {
      await prisma.storeSellerApplication.update({ where: { id: open.id }, data: { requestedAppMode: parsed.data.requestedAppMode } });
    }
    return NextResponse.json({ application: open, resumed: true });
  }

  const [business, owner] = await Promise.all([
    prisma.business.findUnique({ where: { id: session.businessId }, select: { name: true, phone: true, email: true, address: true } }),
    prisma.user.findUnique({ where: { id: session.sub }, select: { name: true, email: true } }),
  ]);
  const reference = await uniqueReference("SA", async (ref) => !!(await prisma.storeSellerApplication.findUnique({ where: { reference: ref } })));
  try {
    const application = await prisma.storeSellerApplication.create({
      data: {
        reference,
        businessId: session.businessId,
        applicantUserId: session.sub,
        requestedAppMode: parsed.data.requestedAppMode ?? null,
        data: {
          registeredName: business?.name ?? "", phone: business?.phone ?? "", email: business?.email ?? "",
          address: business?.address ?? "", country: "Ghana", repName: owner?.name ?? "", repEmail: owner?.email ?? "",
          offersCollection: true,
        },
        events: { create: { actorType: "BUSINESS_USER", actorId: session.sub, actorLabel: await actorLabel(session), action: "CREATED", toStatus: "DRAFT" } },
      },
    });
    return NextResponse.json({ application }, { status: 201 });
  } catch (e) {
    // Unique index "one open application per business" caught a race.
    const again = await prisma.storeSellerApplication.findFirst({ where: { businessId: session.businessId, status: { in: OPEN_APPLICATION_STATUSES } } });
    if (again) return NextResponse.json({ application: again, resumed: true });
    console.error("Create application failed:", e);
    return NextResponse.json({ error: "The application could not be started." }, { status: 500 });
  }
}
