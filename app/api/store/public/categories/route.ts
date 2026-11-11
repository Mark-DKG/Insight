import { NextResponse } from "next/server";
import { publicCategories } from "@/lib/store/public";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ categories: await publicCategories() }, { headers: { "Cache-Control": "public, max-age=300" } });
}
