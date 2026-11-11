import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { readUpload, getStoreConfig } from "@/lib/store/server";
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from "@/lib/store/core";

// POST /api/seller/applications/[id]/documents (multipart: file, docKey)
// Stored privately in the database. Never served from a public URL.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "store:apply")) {
    return NextResponse.json({ error: "Only the business owner can upload application documents." }, { status: 403 });
  }
  const app = await prisma.storeSellerApplication.findFirst({ where: { id: params.id, businessId: session.businessId } });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (app.status !== "DRAFT" && app.status !== "INFO_REQUIRED") {
    return NextResponse.json({ error: "Documents can only be added to a draft or when more information is requested." }, { status: 409 });
  }
  const count = await prisma.storeDocument.count({ where: { applicationId: app.id } });
  if (count >= 10) return NextResponse.json({ error: "An application can have at most 10 documents." }, { status: 400 });

  const upload = await readUpload(request, { maxBytes: DOCUMENT_MAX_BYTES, types: DOCUMENT_TYPES });
  if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: 400 });
  const docKey = String(upload.form?.get("docKey") ?? "other").slice(0, 40);
  const config = await getStoreConfig();
  const keys = new Set([...(config.requiredDocuments as { key: string }[]).map((d) => d.key), "other"]);
  if (!keys.has(docKey)) return NextResponse.json({ error: "Unknown document type." }, { status: 400 });

  const doc = await prisma.storeDocument.create({
    data: {
      applicationId: app.id, businessId: session.businessId, docKey, fileName: upload.name, mimeType: upload.mime,
      sizeBytes: upload.bytes.length, sha256: createHash("sha256").update(upload.bytes).digest("hex"),
      data: Buffer.from(upload.bytes), uploadedByUserId: session.sub,
    },
    select: { id: true, docKey: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
  });
  return NextResponse.json({ document: doc }, { status: 201 });
}
