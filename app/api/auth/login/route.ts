import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  AUTH_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
} from "@/lib/auth";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// A generic message for any credential failure — never reveal whether the
// email exists, to avoid leaking account presence to an attacker.
const INVALID_CREDENTIALS_MESSAGE = "Incorrect email or password.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    businessId: user.businessId,
    branchId: user.branchId,
    role: user.role,
    email: user.email,
  });

  const { token: refreshToken, hash, expiresAt } = generateRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        businessId: user.businessId,
        userId: user.id,
        action: "LOGIN",
        entityType: "User",
        entityId: user.id,
      },
    }),
  ]);

  const response = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      branchId: user.branchId,
    },
  });

  response.cookies.set(AUTH_COOKIE, accessToken, { ...cookieOptions, maxAge: 15 * 60 });
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}
