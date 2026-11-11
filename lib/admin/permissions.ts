// Platform administrator permission model. Roles map to default permission
// sets; individual admins can be granted extra permissions (stored on
// PlatformAdmin.extraPermissions). Every admin API checks a permission, never
// a role name, so capabilities can be adjusted without code changes elsewhere.

export const PLATFORM_PERMISSIONS = [
  "businesses.read",
  "businesses.manage",
  "users.read",
  "users.manage",
  "transactions.read",
  "inventory.read",
  "inventory.manage",
  "analytics.read",
  "audit.read",
  "system.monitor",
  "settings.manage",
  "administrators.manage",
  "workspace.access",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type PlatformRole = "SUPER_ADMIN" | "PLATFORM_ADMIN" | "TECHNICAL_ADMIN" | "SUPPORT_ADMIN" | "ANALYST";

export const ROLE_DEFAULTS: Record<PlatformRole, PlatformPermission[]> = {
  SUPER_ADMIN: [...PLATFORM_PERMISSIONS],
  PLATFORM_ADMIN: ["businesses.read", "users.read", "analytics.read", "audit.read"],
  TECHNICAL_ADMIN: ["system.monitor", "businesses.read", "audit.read"],
  // Support staff see business directories but not business data by default;
  // workspace.access must be granted explicitly.
  SUPPORT_ADMIN: ["businesses.read", "users.read"],
  ANALYST: ["analytics.read", "businesses.read"],
};

export const ROLE_LABEL: Record<PlatformRole, string> = {
  SUPER_ADMIN: "Super Admin",
  PLATFORM_ADMIN: "Platform Admin",
  TECHNICAL_ADMIN: "Technical Admin",
  SUPPORT_ADMIN: "Support Admin",
  ANALYST: "Analyst",
};

export function effectivePermissions(role: PlatformRole, extra: string[] = []): PlatformPermission[] {
  if (role === "SUPER_ADMIN") return [...PLATFORM_PERMISSIONS];
  const valid = extra.filter((p): p is PlatformPermission => (PLATFORM_PERMISSIONS as readonly string[]).includes(p));
  // administrators.manage is reserved for Super Admins, whatever is stored.
  return Array.from(new Set([...ROLE_DEFAULTS[role], ...valid])).filter((p) => p !== "administrators.manage");
}

export function hasPermission(role: PlatformRole, extra: string[], permission: PlatformPermission): boolean {
  return effectivePermissions(role, extra).includes(permission);
}
