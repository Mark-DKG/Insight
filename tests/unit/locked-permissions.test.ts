import test from "node:test";
import assert from "node:assert/strict";
import { can } from "../../lib/rbac";

const owner = { sub: "u", businessId: "b", branchId: null, role: "OWNER" as const, email: "o@example.com" };

test("an unlocked owner keeps every permission", () => {
  for (const p of ["products:read", "sales:create", "settings:write", "store:apply", "reports:read"] as const) assert.equal(can(owner, p), true);
});
test("a business waiting for approval can only apply and change package", () => {
  const locked = { ...owner, locked: true };
  assert.equal(can(locked, "store:apply"), true);
  assert.equal(can(locked, "store:read"), true);
  assert.equal(can(locked, "settings.manage_application_mode"), true);
  for (const p of ["products:read", "products:write", "inventory:read", "inventory:adjust", "sales:create", "sales:read", "customers:read", "suppliers:read", "purchases:read", "expenses:read", "employees:read", "reports:read", "settings:read", "settings:write", "branches:write", "store:manage"] as const) {
    assert.equal(can(locked, p), false, p);
  }
});
