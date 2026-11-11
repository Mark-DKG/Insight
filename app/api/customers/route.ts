import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, tenantScope } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { moduleGate } from "@/lib/features";

export async function GET(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "customers:read")) {
    return NextResponse.json({ error: "You don't have access to view customers." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "customers");
  if (blocked) return blocked;

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const onCreditOnly = url.searchParams.get("onCredit") === "true";

  const customers = await prisma.customer.findMany({
    where: {
      ...tenantScope(session),
      ...(onCreditOnly ? { creditBalance: { gt: 0 } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ customers });
}

const CreateCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required."),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  creditLimit: z.number().nonnegative().default(0),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!requirePermission(session, "customers:write")) {
    return NextResponse.json({ error: "You don't have permission to add customers." }, { status: 403 });
  }
  const blocked = await moduleGate(session, "customers");
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = CreateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid customer data." }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: { ...parsed.data, businessId: session.businessId },
  });

  return NextResponse.json({ customer }, { status: 201 });
}
