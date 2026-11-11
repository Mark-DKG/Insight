"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Store as StoreIcon } from "lucide-react";

// One place that maps sidebar keys to real routes, so every screen's
// sidebar behaves identically, and one place that applies the business's
// package (Full / Inventory Only / Store and Inventory / POS and Inventory)
// to navigation.
//
// The server is the authority: API routes for disabled modules return
// 403 MODULE_DISABLED (lib/features.ts). This file only keeps the interface
// consistent with that — hiding links and redirecting away from pages that
// would otherwise fail.

export const NAV_ROUTES = {
  dashboard: "/dashboard",
  pos: "/pos",
  sales: "/sales",
  inventory: "/inventory",
  products: "/inventory",
  purchases: "/purchases",
  customers: "/customers",
  suppliers: "/purchases?tab=suppliers",
  expenses: "/expenses",
  reports: "/reports",
  employees: "/expenses?tab=employees",
  advanced: "/advanced",
  settings: "/settings",
  store: "/seller",
};

// Packages without POS: the inventory screen is the dashboard, and staff
// management lives under Settings (the Expenses screen that normally hosts
// it is disabled).
const NO_POS_ROUTES = {
  dashboard: "/inventory",
  employees: "/settings?section=users",
};

/** True when the package includes POS and sales management. */
export function hasPos(mode) {
  return mode !== "INVENTORY_ONLY" && mode !== "STORE_INVENTORY";
}
/** True when the package includes Insight Store. */
export function hasStore(mode) {
  return mode === "FULL" || mode === "STORE_INVENTORY";
}

// Sidebar keys / pages that are unavailable without POS.
export const INVENTORY_ONLY_HIDDEN = ["pos", "sales", "customers", "expenses", "advanced"];
const NO_POS_BLOCKED_PAGES = ["dashboard", "pos", "sales", "customers", "expenses", "advanced"];

// ---- shared mode store (one fetch per page load) ---------------------------
let modeCache = null; // { mode, canChange }
let modePromise = null;
const listeners = new Set();

function loadMode(force = false) {
  if (modePromise && !force) return modePromise;
  modePromise = fetch("/api/business/mode")
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      if (body?.mode) {
        modeCache = { mode: body.mode, canChange: !!body.canChange };
        listeners.forEach((l) => l(modeCache));
      }
      return modeCache;
    })
    .catch(() => modeCache);
  return modePromise;
}

/** Re-reads the mode after it has been changed in Settings. */
export function refreshAppMode() {
  return loadMode(true);
}

/**
 * Returns the active package ("FULL" | "INVENTORY_ONLY" | "STORE_INVENTORY" |
 * "POS_INVENTORY" | null while loading).
 * Pass the current page's key to be redirected away from a page that the
 * active mode disables.
 */
export function useAppMode(pageKey) {
  const router = useRouter();
  const [state, setState] = useState(modeCache);

  useEffect(() => {
    listeners.add(setState);
    loadMode().then((s) => s && setState(s));
    return () => listeners.delete(setState);
  }, []);

  const mode = state?.mode ?? null;
  useEffect(() => {
    if (!mode || !pageKey) return;
    if (!hasPos(mode) && NO_POS_BLOCKED_PAGES.includes(pageKey)) {
      router.replace(pageKey === "dashboard" ? "/inventory" : "/inventory?notice=inventory-only");
    } else if (!hasStore(mode) && pageKey === "store") {
      router.replace("/settings?section=store");
    }
  }, [mode, pageKey, router]);

  return mode;
}

export function useCanChangeAppMode() {
  const [state, setState] = useState(modeCache);
  useEffect(() => {
    listeners.add(setState);
    loadMode().then((s) => s && setState(s));
    return () => listeners.delete(setState);
  }, []);
  return !!state?.canChange;
}

const STORE_ITEM = { key: "store", label: "Insight Store", icon: StoreIcon };

/** Filters a screen's NAV_ITEMS for the active package. */
export function visibleNav(items, mode) {
  let out = hasPos(mode) || !mode ? items : items.filter((i) => !INVENTORY_ONLY_HIDDEN.includes(i.key));
  if (hasStore(mode) && !out.some((i) => i.key === "store")) {
    const at = out.findIndex((i) => i.key === "settings");
    out = at < 0 ? [...out, STORE_ITEM] : [...out.slice(0, at), STORE_ITEM, ...out.slice(at)];
  }
  return out;
}

export function useAppNav() {
  const router = useRouter();
  return async (key) => {
    if (key === "logout") {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        modeCache = null;
        modePromise = null;
        router.push("/login");
        router.refresh();
      }
      return;
    }
    const mode = modeCache?.mode;
    const href = (mode && !hasPos(mode) && NO_POS_ROUTES[key]) || NAV_ROUTES[key];
    if (href) router.push(href);
  };
}
