"use client";

import React from "react";

// Shared building blocks for the platform admin console. Visually distinct
// from the business app (charcoal navigation) while keeping Insight's green.

export const ADMIN_THEMES = {
  light: {
    bg: "#F4F6F5", surface: "#FFFFFF", surfaceAlt: "#F9FAFB", border: "#E5E7EB", text: "#1F2937", muted: "#6B7280",
    nav: "#111827", navText: "#D1D5DB", navActive: "#1F2937", accent: "#2E7D32", accentSoft: "#E7F5EA",
    danger: "#B3261E", dangerSoft: "#FBE9E7", warn: "#B7791F", warnSoft: "#FFF4E0", input: "#FFFFFF",
  },
  dark: {
    bg: "#0B0F0D", surface: "#111815", surfaceAlt: "#151E1A", border: "#24302A", text: "#E5EDE8", muted: "#93A39A",
    nav: "#05080A", navText: "#AEB9B3", navActive: "#16201B", accent: "#4CAF50", accentSoft: "#173C26",
    danger: "#F2766B", dangerSoft: "#3A1D1B", warn: "#E0A84A", warnSoft: "#33291A", input: "#0F1512",
  },
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const fmtNum = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString());
export const fmtMoney = (n, cur) => `${cur ?? ""} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

export function Card({ t, title, action, children, style }) {
  return (
    <section style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          {title && <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ t, label, value, sub }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: t.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: t.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function Badge({ t, tone = "neutral", children }) {
  const map = {
    good: [t.accent, t.accentSoft], bad: [t.danger, t.dangerSoft], warn: [t.warn, t.warnSoft], neutral: [t.muted, t.surfaceAlt],
  };
  const [c, bg] = map[tone] ?? map.neutral;
  return <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4, color: c, background: bg, whiteSpace: "nowrap" }}>{children}</span>;
}

export function Button({ t, kind = "secondary", children, style, ...rest }) {
  const kinds = {
    primary: { background: t.accent, color: "#fff", border: "none" },
    danger: { background: t.danger, color: "#fff", border: "none" },
    secondary: { background: "transparent", color: t.text, border: `1px solid ${t.border}` },
  };
  return (
    <button
      {...rest}
      style={{
        padding: "8px 14px", borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: rest.disabled ? "default" : "pointer",
        opacity: rest.disabled ? 0.6 : 1, fontFamily: "inherit", ...kinds[kind], ...style,
      }}
    >
      {children}
    </button>
  );
}

export function inputStyle(t) {
  return { width: "100%", boxSizing: "border-box", border: `1px solid ${t.border}`, borderRadius: 6, padding: "9px 11px", fontSize: 13.5, background: t.input, color: t.text, fontFamily: "inherit" };
}

export function Notice({ t, tone = "bad", children }) {
  const c = tone === "good" ? [t.accent, t.accentSoft] : tone === "warn" ? [t.warn, t.warnSoft] : [t.danger, t.dangerSoft];
  return <div role={tone === "bad" ? "alert" : "status"} style={{ padding: "10px 12px", borderRadius: 6, fontSize: 13, color: c[0], background: c[1] }}>{children}</div>;
}

/**
 * Confirmation dialog for sensitive actions. Requires a written reason when
 * `requireReason` is set; the reason is stored in the audit log.
 */
export function ConfirmDialog({ t, title, body, confirmLabel, danger, requireReason, busy, error, onCancel, onConfirm, children }) {
  const [reason, setReason] = React.useState("");
  const ok = !requireReason || reason.trim().length >= 5;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div style={{ width: "min(480px, 100%)", background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: 22 }}>
        <h2 id="admin-dialog-title" style={{ fontSize: 16, margin: "0 0 10px" }}>{title}</h2>
        <div style={{ fontSize: 13.5, color: t.muted, marginBottom: 14, lineHeight: 1.5 }}>{body}</div>
        {children}
        {requireReason && (
          <>
            <label htmlFor="admin-reason" style={{ fontSize: 12.5, fontWeight: 600, display: "block", margin: "4px 0 6px" }}>
              Reason (recorded in the audit log)
            </label>
            <textarea id="admin-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle(t), resize: "vertical" }} />
          </>
        )}
        {error && <div style={{ marginTop: 10 }}><Notice t={t}>{error}</Notice></div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Button t={t} onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button t={t} kind={danger ? "danger" : "primary"} disabled={busy || !ok} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
