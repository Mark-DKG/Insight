import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { getEmailState, sendEmail } from "@/lib/email/service";

// Sends one real test message to the central address and reports exactly what
// the provider answered. It does not pretend: if email is off or the provider
// refuses, that is what comes back.
export async function POST() {
  const ctx = await requireAdmin("settings.manage");
  if (ctx instanceof NextResponse) return ctx;
  const state = await getEmailState();
  const out = await sendEmail({ category: "test", template: "admin_test", to: state.centralAddress, data: { when: new Date().toUTCString() }, key: `test:${ctx.admin.id}:${Date.now()}` });
  const row = out.id ? await prisma.emailMessage.findUnique({ where: { id: out.id }, select: { status: true, providerId: true, attempts: true, lastError: true } }) : null;
  await platformAudit(ctx, { action: "EMAIL_TEST_SENT", targetType: "EmailMessage", targetId: out.id ?? null, reason: "Test email", after: { result: out.result, status: row?.status ?? null } });
  return NextResponse.json({
    result: out.result,
    delivered: out.result === "sent",
    note: out.result === "sent" ? "Accepted by Resend. Check the inbox and the delivery status below; acceptance is not delivery." : undefined,
    providerId: row?.providerId ?? null,
    status: row?.status ?? null,
    attempts: row?.attempts ?? 0,
    error: out.error ?? row?.lastError ?? null,
    stateReason: state.reason,
  }, { status: out.result === "sent" ? 200 : out.result === "skipped" ? 409 : 502 });
}
