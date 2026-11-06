import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

// Registration creates a brand-new tenant: one Business, one main Branch,
// and one OWNER user. Every subsequent user in this business is invited by
// an existing OWNER/MANAGER through a separate, authenticated endpoint —
// registration itself never accepts a role or businessId from the client.

const RegisterSchema = z.object({
  businessName: z.string().min(2, "Business name is too short."),
  ownerName: z.string().min(2, "Name is too short."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  currency: z.string().default("GHS"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid registration details." },
      { status: 400 }
    );
  }

  const { businessName, ownerName, email, password, currency } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: { name: businessName, currency },
    });

    const branch = await tx.branch.create({
      data: { businessId: business.id, name: "Main Branch", isMain: true },
    });

    const owner = await tx.user.create({
      data: {
        businessId: business.id,
        branchId: branch.id,
        name: ownerName,
        email,
        passwordHash,
        role: "OWNER",
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.id,
        userId: owner.id,
        action: "BUSINESS_REGISTERED",
        entityType: "Business",
        entityId: business.id,
      },
    });

    return { business, owner };
  });

  return NextResponse.json(
    {
      message: "Account created. Please log in.",
      businessId: result.business.id,
      userId: result.owner.id,
    },
    { status: 201 }
  );
}
