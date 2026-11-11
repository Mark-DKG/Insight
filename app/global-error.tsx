"use client";

import { useEffect } from "react";
import CrashScreen from "@/components/crash-screen";
import { reportClientError } from "@/lib/report-error";

// Last-resort boundary for crashes in the root layout itself.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { source: "global-boundary" });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <CrashScreen onRetry={() => window.location.reload()} />
      </body>
    </html>
  );
}
