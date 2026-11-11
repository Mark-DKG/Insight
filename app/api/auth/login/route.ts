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

// Brute-force protection: after MAX_FAILED_ATTEMPTS wrong passwords for an
// account within LOCKOUT_WINDOW_MS, further attempts are refused until the
// window passes. Counted from the audit log, so it holds across serverless
// instances without needing extra infrastructure.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { business: { select: { status: true } } },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const recentFailures = await prisma.auditLog.count({
    where: {
      userId: user.id,
      action: "LOGIN_FAILED",
      createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
    },
  });
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please wait 15 minutes and try again." },
      { status: 429 }
    );
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    await prisma.auditLog
      .create({
        data: { businessId: user.businessId, userId: user.id, action: "LOGIN_FAILED", entityType: "User", entityId: user.id },
      })
      .catch(() => null);
    return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  if (user.business.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "This business account has been suspended. Contact 9DEVs support." },
      { status: 403 }
    );
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
