"use client";

import { useEffect } from "react";

// Wraps window.fetch so that a 401 from any same-origin /api call triggers
// one silent session refresh and a retry. Concurrent 401s share one refresh.
export default function AuthFetch() {
  useEffect(() => {
    const original = window.fetch.bind(window);
    let refreshing: Promise<boolean> | null = null;

    const refresh = () => {
      refreshing ??= original("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => { refreshing = null; });
      return refreshing;
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.startsWith("http") ? new URL(url).pathname : url;
      if (res.status !== 401 || !path.startsWith("/api/") || path.startsWith("/api/auth/")) return res;
      if (init?.body && typeof init.body !== "string") return res; // can't safely replay streams
      return (await refresh()) ? original(input, init) : res;
    };

    return () => { window.fetch = original; };
  }, []);
  return null;
}
