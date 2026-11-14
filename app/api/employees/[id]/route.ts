import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// PATCH /api/employees/[id] — edit an employee: name, role, branch, and
// suspension / reactivation. Employees are never deleted (their sales and
// audit history must stay intact); "suspended" means isActive = false.
//
// Authority (enforced here, not in the UI):
//   OWNER   can edit any MANAGER or CASHIER in the business, set role to
//           MANAGER or CASHIER, and suspend/reactivate them.
//   MANAGER can edit CASHIERS only (name, branch, suspend/reactivate). A
//           manager cannot change anyone's role, touch another manager or the
//           owner, or edit themselves.
//   Nobody can change their own role or suspend themselves, and nobody can
//   create or promote an OWNER through this route.
const Schema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").optional(),
    role: z.enum(["MANAGER", "CASHIER"]).optional(),
    branchId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

class EmployeeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "employees:manage")) {
    return NextResponse.json({ error: "You don't have permission to manage employees." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid employee details." }, { status: 400 });
  }
  const change = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findFirst({ where: { id: params.id, businessId: session.businessId } });
      if (!target) throw new EmployeeError("Employee not found.", 404);
      if (target.role === "OWNER") throw new EmployeeError("The business owner can't be changed here.", 403);
      if (target.id === session.sub && (change.role !== undefined || change.isActive !== undefined)) {
        throw new EmployeeError("You can't change your own role or suspend your own account.", 403);
      }
      if (session.role === "MANAGER") {
        if (target.role !== "CASHIER" || target.id === session.sub) throw new EmployeeError("Managers can only manage cashiers.", 403);
        if (change.role !== undefined && change.role !== "CASHIER") throw new EmployeeError("Only the owner can change an employee's role.", 403);
      }
      if (change.branchId) {
        const branch = await tx.branch.findFirst({ where: { id: change.branchId, businessId: session.businessId }, select: { id: true } });
        if (!branch) throw new EmployeeError("That branch doesn't belong to this business.", 400);
      }

      const data: Record<string, unknown> = {};
      if (change.name !== undefined && change.name !== target.name) data.name = change.name;
      if (change.role !== undefined && change.role !== target.role) data.role = change.role;
      if (change.branchId !== undefined && change.branchId !== target.branchId) data.branchId = change.branchId;
      if (change.isActive !== undefined && change.isActive !== target.isActive) data.isActive = change.isActive;
      if (Object.keys(data).length === 0) return target; // nothing actually changed

      const user = await tx.user.update({ where: { id: target.id }, data });

      // Suspension ends every live session now: the access token is already
      // refused on the next request (getSession re-checks the user), and the
      // refresh tokens are revoked so no new one can be minted.
      if (data.isActive === false) {
        await tx.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      const action = data.isActive === false ? "EMPLOYEE_SUSPENDED" : data.isActive === true ? "EMPLOYEE_REACTIVATED" : data.role ? "EMPLOYEE_ROLE_CHANGED" : "EMPLOYEE_UPDATED";
      await tx.auditLog.create({
        data: {
          businessId: session.businessId,
          userId: session.sub,
          branchId: user.branchId,
          action,
          entityType: "User",
          entityId: target.id,
          previousValue: { name: target.name, role: target.role, branchId: target.branchId, isActive: target.isActive },
          newValue: { name: user.name, role: user.role, branchId: user.branchId, isActive: user.isActive },
        },
      });
      return user;
    });

    return NextResponse.json({
      employee: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, branchId: updated.branchId, isActive: updated.isActive },
    });
  } catch (error) {
    if (error instanceof EmployeeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Employee update failed:", error);
    return NextResponse.json({ error: "The employee could not be updated. Nothing was modified." }, { status: 500 });
  }
}
