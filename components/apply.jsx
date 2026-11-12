"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut } from "lucide-react";
import { StoreSettings } from "./store-settings";
import { APPROVAL_WINDOW } from "../lib/store/application-rules";

// The only screen an owner can use while a store package waits for approval.
// Everything else (dashboards, inventory, POS, settings) is refused by the
// server until the Insight Store team approves the application.

const theme = {
  bg: "#F0FFF0", surface: "#FFFFFF", surfaceAlt: "#FFFFFF", border: "#E5E7EB",
  text: "#1F2937", textMuted: "#5B6B63", sidebar: "#145A32", sidebarText: "#DDEDE2", sidebarActive: "#1F6E3F",
};
const inputStyle = { width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: "#FAFCFA", color: theme.text };
const label = { fontSize: 12.5, fontWeight: 600, marginBottom: 6, display: "block" };
const Card = ({ children, style }) => (
  <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 20, ...style }}>{children}</div>
);

export default function Apply() {
  const router = useRouter();
  const [mode, setMode] = useState(null);

  useEffect(() => {
    fetch("/api/business/mode")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) { router.replace("/login"); return; }
        if (b.packageSelected === false) router.replace("/choose-package");
        else if (!b.locked) router.replace("/dashboard"); // approved, or on a package with no approval step
        else setMode(b);
      })
      .catch(() => {});
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 48px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <img src="/brand/insight-logo.png" alt="Insight" style={{ width: 128, height: "auto" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/choose-package" style={{ fontSize: 13, color: "#145A32", fontWeight: 600, padding: "8px 10px", textDecoration: "none" }}>Choose a different package</a>
            <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, cursor: "pointer", color: theme.text }}>
              <LogOut size={14} /> Log out
            </button>
          </div>
        </div>

        <div role="note" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#FFF7E6", border: "1px solid #F0D9A8", borderLeft: "4px solid #B7791F", borderRadius: 8, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
          <Clock size={16} style={{ marginTop: 3, flexShrink: 0, color: "#8A5A00" }} />
          <div>
            <b>Your dashboard unlocks after approval.</b> Complete the form below and submit it. The Insight Store team reviews applications in {APPROVAL_WINDOW}, and you'll be able to use {mode?.pendingMode === "FULL" ? "the Full package" : "Store and Inventory"} as soon as it's approved. Want to start working right away? Choose a package without Insight Store instead.
          </div>
        </div>

        {mode ? <StoreSettings theme={theme} dark={false} card={Card} inputStyle={inputStyle} label={label} appMode={mode.mode} /> : <div style={{ color: theme.textMuted }}>Loading…</div>}

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 11.5, color: theme.textMuted }}>
          Built by <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 600 }}>9DEVs</a>
        </div>
      </div>
    </div>
  );
}
