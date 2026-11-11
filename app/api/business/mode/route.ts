import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { disabledModules, type AppMode } from "@/lib/features";

// GET /api/business/mode — the active mode for the caller's business. Any
// signed-in user may read it (the UI needs it to build navigation).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: { appMode: true },
  });
  const mode = (business?.appMode ?? "FULL") as AppMode;
  return NextResponse.json({
    mode,
    disabledModules: disabledModules(mode),
    canChange: requirePermission(session, "settings.manage_application_mode"),
  });
}

const Schema = z.object({
  mode: z.enum(["FULL", "INVENTORY_ONLY"]),
  confirm: z.literal(true, { errorMap: () => ({ message: "Confirm the mode change to continue." }) }),
});

// PUT /api/business/mode — switch modes. Requires the dedicated
// settings.manage_application_mode permission, checked here on the server;
// hiding the switch in the UI is not relied on. Only the caller's own
// business is touched, and every change is audit-logged.
export async function PUT(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "settings.manage_application_mode")) {
    return NextResponse.json(
      { error: "Only the business owner can change the application mode." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const next = parsed.data.mode;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.business.findUnique({
        where: { id: session.businessId },
        select: { appMode: true },
      });
      if (!current) throw new Error("Business not found.");
      if (current.appMode === next) return { previous: current.appMode, mode: next, changed: false };

      await tx.business.update({ where: { id: session.businessId }, data: { appMode: next } });
      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          branchId: session.branchId,
          action: "APP_MODE_CHANGED",
          entityType: "Business",
          entityId: session.businessId,
          previousValue: { appMode: current.appMode },
          newValue: { appMode: next },
        },
      });
      return { previous: current.appMode, mode: next, changed: true };
    });

    return NextResponse.json({ ...result, disabledModules: disabledModules(result.mode as AppMode) });
  } catch (error) {
    console.error("Application mode change failed:", error);
    return NextResponse.json(
      { error: "The mode could not be changed. Your business is still in its previous mode." },
      { status: 500 }
    );
  }
}
