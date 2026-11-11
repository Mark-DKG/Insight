import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";

// GET /api/employees/shifts?userId=&branchId=&active=true
export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "employees:read")) {
    return NextResponse.json({ error: "You don't have access to view shifts." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "shifts");
  if (blocked) return blocked;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? undefined;
  const activeOnly = url.searchParams.get("active") === "true";

  const shifts = await prisma.employeeShift.findMany({
    where: {
      user: { businessId: session.businessId },
      ...(userId ? { userId } : {}),
      ...(activeOnly ? { endedAt: null } : {}),
    },
    include: { user: { select: { name: true, role: true } }, branch: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({ shifts });
}

const StartShiftSchema = z.object({
  branchId: z.string().uuid(),
  // Defaults to the caller's own shift; a manager can open one on behalf of
  // a cashier who forgot to clock in, which is why this is optional.
  userId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "employees:read")) {
    return NextResponse.json({ error: "You don't have permission to start a shift." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "shifts");
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = StartShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid shift data." }, { status: 400 });
  }

  const targetUserId = parsed.data.userId ?? session.sub;

  // Only an owner/manager may open a shift for someone other than themself.
  if (targetUserId !== session.sub && !requirePermission(session, "employees:write")) {
    return NextResponse.json({ error: "You can only start your own shift." }, { status: 403 });
  }

  const alreadyOpen = await prisma.employeeShift.findFirst({
    where: { userId: targetUserId, endedAt: null },
  });
  if (alreadyOpen) {
    return NextResponse.json({ error: "This employee already has an open shift." }, { status: 409 });
  }

  const shift = await prisma.employeeShift.create({
    data: { userId: targetUserId, branchId: parsed.data.branchId },
  });

  return NextResponse.json({ shift }, { status: 201 });
}
