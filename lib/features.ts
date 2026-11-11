import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import type { SessionClaims } from "./auth";

// ----------------------------------------------------------------------------
// Application mode / feature access
//
// Every business runs in one of two modes (Business.appMode):
//   FULL            complete retail management (default)
//   INVENTORY_ONLY  standalone inventory software
//
// Mode gating is a second, independent check layered on top of role
// permissions (lib/rbac.ts) and tenant scoping (lib/tenant.ts). A route that
// belongs to a disabled module rejects the request with 403 MODULE_DISABLED
// even if the caller's role would otherwise allow it. Data is never deleted:
// switching back to FULL makes the same records available again.
// ----------------------------------------------------------------------------

export type AppMode = "FULL" | "INVENTORY_ONLY" | "STORE_INVENTORY" | "POS_INVENTORY";

export type Module =
  | "pos"        // checkout: creating sales
  | "sales"      // sales history, receipts, voids/refunds
  | "customers"  // customers, customer credit, statements, payments
  | "expenses"   // expense management
  | "finance"    // profit & loss reporting
  | "shifts"     // cashier shifts / cash reconciliation (POS-dependent)
  | "advanced"   // POS-dependent analytics
  | "store";     // Insight Store marketplace selling (also needs seller approval)

// Business operating packages. Inventory is in every package.
//   FULL             inventory + POS + Insight Store + all management modules
//   INVENTORY_ONLY   inventory only
//   STORE_INVENTORY  inventory + Insight Store (no POS)
//   POS_INVENTORY    inventory + POS (no Insight Store)
const POS_MODULES: Module[] = ["pos", "sales", "customers", "expenses", "finance", "shifts", "advanced"];
const DISABLED_IN: Record<AppMode, Module[]> = {
  FULL: [],
  INVENTORY_ONLY: [...POS_MODULES, "store"],
  STORE_INVENTORY: [...POS_MODULES],
  POS_INVENTORY: ["store"],
};

export const PACKAGE_LABEL: Record<AppMode, string> = {
  FULL: "Full",
  INVENTORY_ONLY: "Inventory Only",
  STORE_INVENTORY: "Store and Inventory",
  POS_INVENTORY: "POS and Inventory",
};

export const APP_MODES: AppMode[] = ["FULL", "INVENTORY_ONLY", "STORE_INVENTORY", "POS_INVENTORY"];

export function packageIncludesStore(mode: AppMode): boolean {
  return !DISABLED_IN[mode].includes("store");
}

const MODULE_LABEL: Record<Module, string> = {
  pos: "Point of Sale",
  sales: "Sales management",
  customers: "Customers and customer credit",
  expenses: "Expense management",
  finance: "Profit and loss reporting",
  shifts: "Cashier shifts",
  advanced: "Sales analytics",
  store: "Insight Store selling",
};

export function isModuleEnabled(mode: AppMode, module: Module): boolean {
  return !DISABLED_IN[mode].includes(module);
}

export function disabledModules(mode: AppMode): Module[] {
  return DISABLED_IN[mode];
}

export async function getAppMode(businessId: string): Promise<AppMode> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { appMode: true },
  });
  return (business?.appMode as AppMode) ?? "FULL";
}

/**
 * Returns a 403 response when `module` is disabled for the caller's business,
 * or null when the request may proceed. Call it after the permission check:
 *
 *   const blocked = await moduleGate(session, "sales");
 *   if (blocked) return blocked;
 */
export async function moduleGate(session: SessionClaims, module: Module): Promise<NextResponse | null> {
  const mode = await getAppMode(session.businessId);
  if (isModuleEnabled(mode, module)) return null;
  return NextResponse.json(
    {
      error: `${MODULE_LABEL[module]} is not included in your ${PACKAGE_LABEL[mode]} package. An owner can change the package in Settings.`,
      code: "MODULE_DISABLED",
      mode,
    },
    { status: 403 }
  );
}
