import { NextResponse } from "next/server";
import { sendAuthEmail } from "@/lib/email/service";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";

// GET /api/employees — the roster this business's Owner/Manager can see.
export async function GET() {
  const session = await getSession();
  if (!requirePermission(session, "employees:read")) {
    return NextResponse.json({ error: "You don't have access to view employees." }, { status: 403 });
  }

  const employees = await prisma.user.findMany({
    where: tenantScope(session),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      branch: { select: { name: true } },
      shifts: {
        where: { endedAt: null },
        select: { id: true, startedAt: true, branchId: true },
        take: 1,
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ employees });
}

// POST /api/employees — this is the "Invite User" action the Settings
// screen's button is wired to. It creates a new teammate *under the
// caller's own business* — the one piece that was missing for anyone
// besides the original registering Owner to get access. Only Owner/Manager
// (employees:write) can do this, and it can never create another OWNER —
// that would let a Manager silently escalate their own access.
const InviteEmployeeSchema = z.object({
  name: z.string().min(1, "Name is required."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Temporary password must be at least 8 characters."),
  role: z.enum(["MANAGER", "CASHIER"]),
  branchId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "employees:write")) {
    return NextResponse.json({ error: "You don't have permission to add employees." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = InviteEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid employee details." }, { status: 400 });
  }
  const input = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, businessId: session.businessId } });
    if (!branch) {
      return NextResponse.json({ error: "That branch doesn't belong to this business." }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(input.password);

  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        businessId: session.businessId,
        branchId: input.branchId ?? session.branchId,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "EMPLOYEE_INVITED",
        entityType: "User",
        entityId: created.id,
        newValue: { name: created.name, email: created.email, role: created.role },
      },
    });

    return created;
  });

  // Invitation email (no password inside). Never blocks the invite.
  try {
    const [biz, inviter] = await Promise.all([
      prisma.business.findUnique({ where: { id: session.businessId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: session.sub }, select: { name: true } }),
    ]);
    await sendAuthEmail("employee_invite", employee.email, { businessName: biz?.name ?? "your business", inviterName: inviter?.name ?? "A manager", roleLabel: employee.role === "MANAGER" ? "Manager" : "Cashier" }, `invite:${employee.id}`, undefined, session.businessId);
  } catch { /* the employee exists either way */ }

  return NextResponse.json(
    { employee: { id: employee.id, name: employee.name, email: employee.email, role: employee.role } },
    { status: 201 }
  );
}
