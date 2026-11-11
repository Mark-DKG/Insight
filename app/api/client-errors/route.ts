import { NextResponse } from "next/server";
import { getSession } from "@/lib/tenant";

// POST /api/client-errors — receives browser crash reports and writes them to
// the server log (Vercel runtime logs) with the business and user attached.
// Nothing is stored in the database and nothing is returned to the client.
export async function POST(request: Request) {
  const session = await getSession().catch(() => null);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return new NextResponse(null, { status: 204 });
  }
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  console.error(
    "[client-error]",
    JSON.stringify({
      message: clip(body.message, 500),
      path: clip(body.path, 200),
      source: clip(body.source, 50),
      digest: clip(body.digest, 100),
      businessId: session?.businessId ?? null,
      userId: session?.sub ?? null,
      userAgent: clip(body.userAgent, 300),
      stack: clip(body.stack, 4000),
    })
  );
  return new NextResponse(null, { status: 204 });
}
