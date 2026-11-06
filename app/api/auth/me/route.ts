import { NextResponse } from "next/server";
import { getSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      businessId: true,
      branchId: true,
      business: { select: { name: true, currency: true, logoUrl: true } },
      branch: { select: { name: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json({ user });
}
