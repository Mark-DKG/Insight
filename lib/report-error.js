// Sends a browser-side crash to the server so it shows up in the Vercel
// runtime logs (client errors are otherwise invisible to anyone but the
// person whose browser crashed). Best-effort and rate-limited per page load.

let sent = 0;
const MAX_REPORTS_PER_PAGE = 5;

export function reportClientError(error, context = {}) {
  try {
    if (typeof window === "undefined" || sent >= MAX_REPORTS_PER_PAGE) return;
    sent += 1;
    const err = error instanceof Error ? error : new Error(String(error?.message ?? error));
    const body = JSON.stringify({
      message: String(err.message).slice(0, 500),
      stack: String(err.stack ?? "").slice(0, 4000),
      digest: error?.digest,
      path: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 300),
      ...context,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Never let error reporting cause another error.
  }
}
