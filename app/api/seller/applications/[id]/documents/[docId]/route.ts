import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// GET: download one of your own application documents.
export async function GET(_request: Request, { params }: { params: { id: string; docId: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:apply")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const doc = await prisma.storeDocument.findFirst({
    where: { id: params.docId, applicationId: params.id, businessId: session.businessId },
  });
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// DELETE: remove a document while the application is still editable.
export async function DELETE(_request: Request, { params }: { params: { id: string; docId: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:apply")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const doc = await prisma.storeDocument.findFirst({
    where: { id: params.docId, applicationId: params.id, businessId: session.businessId },
    include: { application: { select: { status: true } } },
  });
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (doc.application.status !== "DRAFT" && doc.application.status !== "INFO_REQUIRED") {
    return NextResponse.json({ error: "Submitted documents can't be removed." }, { status: 409 });
  }
  await prisma.storeDocument.delete({ where: { id: doc.id } });
  return NextResponse.json({ ok: true });
}
