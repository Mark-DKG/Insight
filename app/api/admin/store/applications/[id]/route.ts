import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/session";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const app = await prisma.storeSellerApplication.findUnique({
    where: { id: params.id },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      documents: { select: { id: true, docKey: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } },
      applicant: { select: { name: true, email: true } },
      business: { select: { id: true, name: true, appMode: true, pendingAppMode: true, status: true, createdAt: true, email: true, phone: true, _count: { select: { products: true, branches: true, users: true } } } },
    },
  });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const previous = await prisma.storeSellerApplication.findMany({
    where: { businessId: app.businessId, id: { not: app.id } }, orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, status: true, decisionReason: true, decidedAt: true, createdAt: true },
  });
  return NextResponse.json({ application: app, previous, permissions: ctx.permissions });
}
