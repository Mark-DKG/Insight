import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/session";
import { processOutbox } from "@/lib/email/service";

export async function POST() {
  const ctx = await requireAdmin("settings.manage");
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json(await processOutbox(25));
}
