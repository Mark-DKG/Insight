"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, AlertTriangle, PackageX, ShoppingBag, Store, FileText, Info, RefreshCw } from "lucide-react";

// The bell in every screen's header. Shows the signed-in user's own unread
// count (from the server, never a placeholder), opens a panel with their
// notifications, marks them read, and opens the related screen.
//
// `endpoint` lets the platform admin console reuse it with its own API.

const ICONS = {
  LOW_STOCK: AlertTriangle, OUT_OF_STOCK: PackageX, STORE_ORDER: ShoppingBag, STORE_APPLICATION: FileText,
  STORE_LISTING: Store, STORE_SELLER: Store,
};
const POLL_MS = 60_000;

function timeAgo(d) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(d).toLocaleDateString();
}

export default function NotificationBell({ theme, dark, endpoint = "/api/notifications" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marking, setMarking] = useState(false);
  const wrap = useRef(null);

  const t = theme ?? { surface: "#fff", border: "#E5E7EB", text: "#1F2937", textMuted: "#5B6B63" };

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch(`${endpoint}?limit=1`);
      if (!res.ok) return;
      const body = await res.json();
      if (typeof body.unread === "number") setUnread(body.unread);
    } catch {}
  }, [endpoint]);

  const loadPage = useCallback(async (from) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}?limit=15${from ? `&cursor=${encodeURIComponent(from)}` : ""}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.error ?? "Notifications could not be loaded."); return; }
      setItems((prev) => (from && prev ? [...prev, ...body.items] : body.items));
      setCursor(body.nextCursor ?? null);
      if (typeof body.unread === "number") setUnread(body.unread);
    } catch {
      setError("You're offline or the server can't be reached.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    refreshCount();
    const id = setInterval(() => { if (typeof document === "undefined" || document.visibilityState !== "hidden") refreshCount(); }, POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    loadPage(null);
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, loadPage]);

  async function markRead(payload) {
    try {
      const res = await fetch(`${endpoint}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.unread === "number") setUnread(body.unread);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function markAll() {
    setMarking(true);
    const ok = await markRead({ all: true });
    if (ok) setItems((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? prev);
    setMarking(false);
  }

  async function openItem(n) {
    if (!n.isRead) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? prev);
      setUnread((u) => Math.max(0, u - 1));
      markRead({ ids: [n.id] });
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ position: "relative", background: "transparent", border: `1px solid ${t.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: t.text, display: "flex" }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span aria-hidden="true" style={{ position: "absolute", top: -6, right: -6, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: "#B3261E", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications"
          style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: "min(370px, calc(100vw - 24px))", maxHeight: "min(520px, 75vh)", display: "flex", flexDirection: "column", background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Notifications</span>
            {unread > 0 && <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 6 }}>{unread} unread</span>}
            <button onClick={markAll} disabled={marking || unread === 0}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: unread ? "#2E7D32" : t.textMuted, fontSize: 12.5, fontWeight: 600, cursor: unread ? "pointer" : "default" }}>
              <CheckCheck size={14} /> Mark all as read
            </button>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {items === null && loading && <div style={{ padding: 20, fontSize: 13, color: t.textMuted, textAlign: "center" }}>Loading…</div>}
            {error && (
              <div style={{ padding: 18, fontSize: 13, textAlign: "center" }}>
                <div style={{ color: "#B3261E", marginBottom: 8 }}>{error}</div>
                <button onClick={() => loadPage(null)} style={{ border: `1px solid ${t.border}`, background: "transparent", color: t.text, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}><RefreshCw size={13} /> Try again</button>
              </div>
            )}
            {items && items.length === 0 && !error && (
              <div style={{ padding: "28px 18px", textAlign: "center", fontSize: 13, color: t.textMuted }}>
                <Bell size={22} style={{ opacity: 0.5, marginBottom: 6 }} />
                <div>You're all caught up.</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Stock alerts, Insight Store orders and application updates will appear here.</div>
              </div>
            )}
            {items?.map((n) => {
              const Icon = ICONS[n.type] ?? Info;
              return (
                <button key={n.id} onClick={() => openItem(n)}
                  style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, padding: "11px 14px", border: "none", borderBottom: `1px solid ${t.border}`, cursor: n.link || !n.isRead ? "pointer" : "default", background: n.isRead ? "transparent" : (dark ? "#173C26" : "#F3FBF4"), color: t.text }}>
                  <Icon size={16} color={n.type === "OUT_OF_STOCK" ? "#B3261E" : n.type === "LOW_STOCK" ? "#B7791F" : "#2E7D32"} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: n.isRead ? 500 : 700 }}>{n.title}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: t.textMuted, marginTop: 2, overflowWrap: "anywhere" }}>{n.message}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: t.textMuted, marginTop: 4 }}>{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.isRead && <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: "50%", background: "#2E7D32", flexShrink: 0, marginTop: 6 }} />}
                </button>
              );
            })}
            {cursor && (
              <div style={{ padding: 10, textAlign: "center" }}>
                <button onClick={() => loadPage(cursor)} disabled={loading} style={{ border: `1px solid ${t.border}`, background: "transparent", color: t.text, borderRadius: 6, padding: "6px 14px", fontSize: 12.5, cursor: "pointer" }}>
                  {loading ? "Loading…" : "Load older"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
