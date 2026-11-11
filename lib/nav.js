"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// One place that maps sidebar keys to real routes, so every screen's
// sidebar behaves identically, and one place that applies the business's
// application mode (Full Functionality / Inventory Only) to navigation.
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
};

// In Inventory Only mode the inventory screen is the dashboard, and staff
// management lives under Settings (the Expenses screen that normally hosts
// it is disabled).
const INVENTORY_ONLY_ROUTES = {
  dashboard: "/inventory",
  employees: "/settings?section=users",
};

// Sidebar keys / pages that are unavailable in Inventory Only mode.
export const INVENTORY_ONLY_HIDDEN = ["pos", "sales", "customers", "expenses", "advanced"];
const INVENTORY_ONLY_BLOCKED_PAGES = ["dashboard", "pos", "sales", "customers", "expenses", "advanced"];

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
 * Returns the active mode ("FULL" | "INVENTORY_ONLY" | null while loading).
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
    if (mode === "INVENTORY_ONLY" && pageKey && INVENTORY_ONLY_BLOCKED_PAGES.includes(pageKey)) {
      router.replace(pageKey === "dashboard" ? "/inventory" : "/inventory?notice=inventory-only");
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

/** Filters a screen's NAV_ITEMS for the active mode. */
export function visibleNav(items, mode) {
  if (mode !== "INVENTORY_ONLY") return items;
  return items.filter((i) => !INVENTORY_ONLY_HIDDEN.includes(i.key));
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
    const href = (mode === "INVENTORY_ONLY" && INVENTORY_ONLY_ROUTES[key]) || NAV_ROUTES[key];
    if (href) router.push(href);
  };
}
