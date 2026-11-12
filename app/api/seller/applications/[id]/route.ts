import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { ApplicationData } from "@/lib/store/application";
import { applicationProblems } from "@/lib/store/application-rules";

// PATCH /api/seller/applications/[id] — save draft answers. Allowed while
// the application is a draft or when the reviewer asked for more information.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:apply")) {
    return NextResponse.json({ error: "Only the business owner can edit the application." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = ApplicationData.safeParse(body?.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid answers." }, { status: 400 });

  const app = await prisma.storeSellerApplication.findFirst({ where: { id: params.id, businessId: session.businessId } });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (app.status !== "DRAFT" && app.status !== "INFO_REQUIRED") {
    return NextResponse.json({ error: "This application can no longer be edited." }, { status: 409 });
  }
  const merged = { ...(app.data as object), ...parsed.data };
  const problems = applicationProblems(merged, { forSubmit: false });
  if (Object.keys(problems).length) {
    return NextResponse.json({ error: Object.values(problems)[0], fields: problems }, { status: 400 });
  }
  const updated = await prisma.storeSellerApplication.update({ where: { id: app.id }, data: { data: merged } });
  return NextResponse.json({ application: updated });
}
