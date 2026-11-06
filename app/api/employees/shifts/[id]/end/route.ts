import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";

// POST /api/employees/shifts/[id]/end
//
// Expected cash is computed here, not trusted from the client: it's the sum
// of CASH-method payments on sales this cashier completed at this branch
// during the shift window. The person only supplies the counted actual
// cash; the variance is the system's own calculation, which is what makes
// it meaningful as an accountability figure (section 23) rather than
// something a dishonest entry could simply match.

const EndShiftSchema = z.object({
  actualCash: z.number().nonnegative("Counted cash can't be negative."),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!requirePermission(session, "employees:read")) {
    return NextResponse.json({ error: "You don't have access to shifts." }, { status: 403 });
  }

  const shift = await prisma.employeeShift.findFirst({
    where: { id: params.id, user: { businessId: session.businessId } },
  });
  if (!shift) {
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  }
  if (shift.endedAt) {
    return NextResponse.json({ error: "This shift has already been closed." }, { status: 409 });
  }

  // A cashier can close their own shift; closing someone else's requires
  // the broader employees:write permission (manager/owner).
  if (shift.userId !== session.sub && !requirePermission(session, "employees:write")) {
    return NextResponse.json({ error: "You can only close your own shift." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = EndShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid cash count." }, { status: 400 });
  }

  const endedAt = new Date();

  const cashSales = await prisma.sale.findMany({
    where: {
      cashierId: shift.userId,
      branchId: shift.branchId,
      paymentMethod: "CASH",
      status: "COMPLETED",
      createdAt: { gte: shift.startedAt, lte: endedAt },
    },
    select: { totalAmount: true },
  });

  const expectedCash = cashSales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const variance = parsed.data.actualCash - expectedCash;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.employeeShift.update({
      where: { id: shift.id },
      data: {
        endedAt,
        expectedCash,
        actualCash: parsed.data.actualCash,
        variance,
      },
    });

    // A non-zero variance is exactly the kind of thing the notification
    // system (section 36) and audit log should both know about.
    if (Math.abs(variance) > 0.01) {
      await tx.notification.create({
        data: {
          businessId: session.businessId,
          branchId: shift.branchId,
          type: "GENERAL",
          title: "Cash variance at shift close",
          message: `Shift for this employee closed with a cash variance of ${variance.toFixed(2)}.`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: session.businessId,
        userId: session.sub,
        action: "SHIFT_CLOSED",
        entityType: "EmployeeShift",
        entityId: shift.id,
        newValue: { expectedCash, actualCash: parsed.data.actualCash, variance },
      },
    });

    return result;
  });

  return NextResponse.json({ shift: updated });
}
