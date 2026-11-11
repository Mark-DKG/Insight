import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { sellerState, getStoreConfig } from "@/lib/store/server";
import { PACKAGE_LABEL, packageIncludesStore } from "@/lib/features";

// GET /api/seller/status — everything the Settings → Insight Store panel and
// the seller area need to decide what to show.
export async function GET() {
  const session = await getSession();
  if (!requirePermission(session, "store:read")) {
    return NextResponse.json({ error: "You don't have access to Insight Store." }, { status: 403 });
  }
  const state = await sellerState(session.businessId);
  const config = await getStoreConfig();
  const app = state.latestApplication
    ? await prisma.storeSellerApplication.findUnique({
        where: { id: state.latestApplication.id },
        include: {
          events: { where: { internal: false }, orderBy: { createdAt: "asc" } },
          documents: { select: { id: true, docKey: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
        },
      })
    : null;
  const history = await prisma.storeSellerApplication.findMany({
    where: { businessId: session.businessId },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, status: true, submittedAt: true, decidedAt: true, decisionReason: true, createdAt: true },
  });
  return NextResponse.json({
    package: { mode: state.mode, label: PACKAGE_LABEL[state.mode], includesStore: packageIncludesStore(state.mode) },
    pendingPackage: state.business?.pendingAppMode ? { mode: state.business.pendingAppMode, label: PACKAGE_LABEL[state.business.pendingAppMode] } : null,
    seller: state.seller,
    canSell: state.canSell,
    blockedReason: state.blockedReason,
    application: app,
    history,
    requiredDocuments: config.requiredDocuments,
    canApply: requirePermission(session, "store:apply"),
  });
}
