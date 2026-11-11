import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/session";
import { ROLE_LABEL } from "@/lib/admin/permissions";

export async function GET() {
  const ctx = await requireAdmin(null, { allowPasswordChangePending: true });
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({
    admin: { ...ctx.admin, roleLabel: ROLE_LABEL[ctx.admin.role] },
    permissions: ctx.permissions,
  });
}
