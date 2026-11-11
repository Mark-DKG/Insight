"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

// Reports errors that happen outside rendering (event handlers, async code,
// failed promises), which error boundaries cannot catch.
export default function ErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.error ?? e.message, { source: "window.onerror" });
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason, { source: "unhandledrejection" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
