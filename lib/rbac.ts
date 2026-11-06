import type { SessionClaims } from "./auth";

// ----------------------------------------------------------------------------
// Permission model
//
// Roles are coarse (OWNER / MANAGER / CASHIER, per the spec); permissions are
// fine-grained strings checked at the route level. Keeping the two separate
// means adding a new capability later doesn't require a schema migration —
// only an update to ROLE_PERMISSIONS below.
// ----------------------------------------------------------------------------

export type Permission =
  | "products:read"
  | "products:write"
  | "inventory:read"
  | "inventory:write"
  | "inventory:adjust"
  | "sales:create"
  | "sales:void"
  | "sales:refund"
  | "sales:read"
  | "customers:read"
  | "customers:write"
  | "suppliers:read"
  | "suppliers:write"
  | "purchases:read"
  | "purchases:write"
  | "expenses:read"
  | "expenses:write"
  | "employees:read"
  | "employees:write"
  | "reports:read"
  | "settings:read"
  | "settings:write"
  | "branches:write";

const ROLE_PERMISSIONS: Record<SessionClaims["role"], Permission[]> = {
  OWNER: [
    "products:read", "products:write",
    "inventory:read", "inventory:write", "inventory:adjust",
    "sales:create", "sales:void", "sales:refund", "sales:read",
    "customers:read", "customers:write",
    "suppliers:read", "suppliers:write",
    "purchases:read", "purchases:write",
    "expenses:read", "expenses:write",
    "employees:read", "employees:write",
    "reports:read",
    "settings:read", "settings:write",
    "branches:write",
  ],
  MANAGER: [
    "products:read", "products:write",
    "inventory:read", "inventory:write", "inventory:adjust",
    "sales:create", "sales:void", "sales:refund", "sales:read",
    "customers:read", "customers:write",
    "suppliers:read", "suppliers:write",
    "purchases:read", "purchases:write",
    "expenses:read", "expenses:write",
    "employees:read",
    "reports:read",
    "settings:read",
  ],
  CASHIER: [
    "products:read",
    "inventory:read",
    "sales:create",
    "sales:read",
    "customers:read",
  ],
};

export function can(claims: SessionClaims, permission: Permission): boolean {
  return ROLE_PERMISSIONS[claims.role]?.includes(permission) ?? false;
}

/** Throws-free guard for use inside route handlers: returns true/false. */
export function requirePermission(claims: SessionClaims | null, permission: Permission): claims is SessionClaims {
  return claims !== null && can(claims, permission);
}
