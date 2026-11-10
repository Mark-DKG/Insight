"use client";

import { useRouter } from "next/navigation";

// One place that maps sidebar keys to real routes, so every screen's
// sidebar behaves identically.
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

export function useAppNav() {
  const router = useRouter();
  return async (key) => {
    if (key === "logout") {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        router.push("/login");
        router.refresh();
      }
      return;
    }
    const href = NAV_ROUTES[key];
    if (href) router.push(href);
  };
}
