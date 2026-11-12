import { NextResponse } from "next/server";
import { endSession } from "@/lib/store/shopper";

// POST /api/store/public/account/logout — revokes the session server-side.
export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
