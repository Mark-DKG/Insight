"use client";

import { useEffect } from "react";
import CrashScreen from "@/components/crash-screen";
import { reportClientError } from "@/lib/report-error";

// Route-level error boundary: any crash while rendering a page lands here
// instead of Next.js's blank "Application error" screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { source: "route-boundary" });
  }, [error]);

  return (
    <CrashScreen
      onRetry={() => {
        reset();
        window.location.reload();
      }}
    />
  );
}
