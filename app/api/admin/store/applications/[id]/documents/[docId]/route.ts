import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";

// Download an application document. Every access is audit-logged.
export async function GET(_request: Request, { params }: { params: { id: string; docId: string } }) {
  const ctx = await requireAdmin("marketplace.read");
  if (ctx instanceof NextResponse) return ctx;
  const doc = await prisma.storeDocument.findFirst({ where: { id: params.docId, applicationId: params.id } });
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  await platformAudit(ctx, { action: "STORE_DOCUMENT_VIEWED", targetBusinessId: doc.businessId, targetType: "StoreDocument", targetId: doc.id, after: { fileName: doc.fileName } });
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
