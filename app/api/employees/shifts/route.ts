import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";

// GET /api/employees/shifts?userId=&branchId=&active=true
export async function GET(request: Request) {
  const session = await getSession();
  const seesAll = requirePermission(session, "employees:read");
  if (!seesAll && !requirePermission(session, "shifts:own")) {
    return NextResponse.json({ error: "You don't have access to view shifts." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "shifts");
  if (blocked) return blocked;

  const url = new URL(request.url);
  // Without employees:read (cashiers) only your own shifts are visible.
  const userId = seesAll ? (url.searchParams.get("userId") ?? undefined) : session!.sub;
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
  if (!requirePermission(session, "shifts:own")) {
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
  if (targetUserId !== session.sub && !requirePermission(session, "employees:manage")) {
    return NextResponse.json({ error: "You can only start your own shift." }, { status: 403 });
  }

  // The target must be an active employee of THIS business, and the branch
  // must belong to it too.
  const [target, branch] = await Promise.all([
    prisma.user.findFirst({ where: { id: targetUserId, businessId: session.businessId, isActive: true }, select: { id: true } }),
    prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: session.businessId }, select: { id: true } }),
  ]);
  if (!target) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  if (!branch) return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  // A cashier works in their assigned branch.
  if (session.role === "CASHIER" && session.branchId && parsed.data.branchId !== session.branchId) {
    return NextResponse.json({ error: "You can only start a shift in your own branch." }, { status: 403 });
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
