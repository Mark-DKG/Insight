import { NextResponse } from "next/server";
import { currentShopper, toPublic } from "@/lib/store/shopper";

export const dynamic = "force-dynamic";

// GET /api/store/public/account/me — { shopper } or { shopper: null }.
export async function GET() {
  const s = await currentShopper().catch(() => null);
  return NextResponse.json({ shopper: s ? toPublic(s) : null }, { headers: { "Cache-Control": "no-store" } });
}
