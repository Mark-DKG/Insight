import { cookies } from "next/headers";
import { AUTH_COOKIE, verifyAccessToken, type SessionClaims } from "./auth";
import { prisma } from "./prisma";

/**
 * Reads and verifies the access-token cookie for the current request.
 * Returns null when there is no valid session — callers decide how to
 * respond (401, redirect, etc.) rather than this helper throwing, so it
 * can be used equally in route handlers and server components.
 */
export async function getSession(): Promise<SessionClaims | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  // Checked on every request (not trusted from the token) so approval, the
  // initial lock, suspension and role/branch changes take effect immediately:
  // a deactivated employee is refused straight away even though their access
  // token has not expired, and a demoted employee loses rights at once.
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { isActive: true, role: true, branchId: true, businessId: true, business: { select: { awaitingApproval: true } } },
  });
  if (!user || !user.isActive || user.businessId !== claims.businessId) return null;
  const fresh = { ...claims, role: user.role, branchId: user.branchId };
  return user.business.awaitingApproval ? { ...fresh, locked: true } : fresh;
}

/**
 * Every tenant-scoped Prisma query MUST include this filter. Centralizing
 * it here means a route can never accidentally query across businesses by
 * forgetting a `where: { businessId }` clause — the helper is the only
 * sanctioned way to build that clause.
 */
export function tenantScope(session: SessionClaims) {
  return { businessId: session.businessId };
}

/**
 * Some resources (inventory levels, shifts) are additionally scoped to a
 * branch. Cashiers are generally restricted to their assigned branch;
 * owners/managers can pass an explicit branchId to look at any branch
 * within their own business.
 */
export function branchScope(session: SessionClaims, requestedBranchId?: string | null) {
  if (session.role === "CASHIER") {
    return { businessId: session.businessId, branchId: session.branchId };
  }
  return {
    businessId: session.businessId,
    ...(requestedBranchId ? { branchId: requestedBranchId } : {}),
  };
}
