import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { randomToken, sha256 } from "./crypto";
import { effectivePermissions, type PlatformPermission, type PlatformRole } from "./permissions";

// ----------------------------------------------------------------------------
// Platform admin sessions
//
// Completely separate from business-user auth: different cookie, different
// table, different secret. A business Owner's token can never satisfy an
// admin check, and an admin session never grants business-user claims.
//
// Sessions are opaque random tokens; only their SHA-256 hash is stored, so
// every request is checked against the database and can be revoked
// instantly. Absolute lifetime 8 h, idle timeout 60 min.
// ----------------------------------------------------------------------------

export const ADMIN_COOKIE = "insight_admin_session";
export const ADMIN_PENDING_COOKIE = "insight_admin_pending";
const SESSION_HOURS = 8;
const IDLE_MINUTES = 60;

export const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

function pendingKey(): Uint8Array {
  const secret = process.env.PLATFORM_ADMIN_SECRET;
  if (!secret || secret.length < 32) throw new Error("PLATFORM_ADMIN_SECRET is missing or shorter than 32 characters.");
  return new TextEncoder().encode(`pending:${secret}`);
}

export type PendingStep = "mfa" | "enroll";

/** Short-lived proof that the password step passed; needed for the MFA step. */
export async function signPending(adminId: string, step: PendingStep): Promise<string> {
  return new SignJWT({ sub: adminId, step })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pendingKey());
}

export async function readPending(): Promise<{ adminId: string; step: PendingStep } | null> {
  const token = cookies().get(ADMIN_PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, pendingKey());
    return { adminId: String(payload.sub), step: payload.step as PendingStep };
  } catch {
    return null;
  }
}

export function requestMeta() {
  const h = headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
    userAgent: (h.get("user-agent") ?? "").slice(0, 300) || null,
    requestId: h.get("x-vercel-id") ?? null,
  };
}

export async function createAdminSession(adminId: string) {
  const token = randomToken(32);
  const meta = requestMeta();
  await prisma.platformAdminSession.create({
    data: {
      adminId,
      tokenHash: sha256(token),
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000),
    },
  });
  return { token, maxAge: SESSION_HOURS * 3600 };
}

export interface AdminContext {
  sessionId: string;
  admin: { id: string; email: string; name: string; role: PlatformRole; mustChangePassword: boolean };
  permissions: PlatformPermission[];
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.platformAdminSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { admin: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.admin.isActive) return null;
  if (Date.now() - session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000) {
    await prisma.platformAdminSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }).catch(() => null);
    return null;
  }
  // Refresh the idle timer at most every 5 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.platformAdminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => null);
  }
  const a = session.admin;
  return {
    sessionId: session.id,
    admin: { id: a.id, email: a.email, name: a.name, role: a.role as PlatformRole, mustChangePassword: a.mustChangePassword },
    permissions: effectivePermissions(a.role as PlatformRole, a.extraPermissions),
  };
}

/**
 * Use at the top of every admin API handler:
 *
 *   const ctx = await requireAdmin("businesses.read");
 *   if (ctx instanceof NextResponse) return ctx;
 *
 * Rejects with 401 when there is no valid admin session, 403 when the admin
 * lacks the permission or still has to change a temporary password.
 */
export async function requireAdmin(
  permission: PlatformPermission | null,
  opts: { allowPasswordChangePending?: boolean } = {}
): Promise<AdminContext | NextResponse> {
  const ctx = await getAdminContext();
  if (!ctx) {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  }
  if (ctx.admin.mustChangePassword && !opts.allowPasswordChangePending) {
    return NextResponse.json({ error: "Change your temporary password to continue.", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  }
  if (permission && !ctx.permissions.includes(permission)) {
    return NextResponse.json({ error: "Your administrator role does not include this permission.", code: "FORBIDDEN" }, { status: 403 });
  }
  return ctx;
}

/** Append a row to the platform audit trail (append-only at the DB level). */
export async function platformAudit(
  ctx: { admin: { id: string; email: string; role: string } } | null,
  entry: {
    action: string;
    targetBusinessId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    actorEmail?: string | null;
  },
  tx: { platformAuditLog: typeof prisma.platformAuditLog } = prisma
) {
  const meta = requestMeta();
  await tx.platformAuditLog.create({
    data: {
      actorId: ctx?.admin.id ?? null,
      actorEmail: ctx?.admin.email ?? entry.actorEmail ?? null,
      actorRole: ctx?.admin.role ?? null,
      action: entry.action,
      targetBusinessId: entry.targetBusinessId ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      reason: entry.reason ?? null,
      before: (entry.before as object | undefined) ?? undefined,
      after: (entry.after as object | undefined) ?? undefined,
      ip: meta.ip,
      requestId: meta.requestId,
    },
  });
}
