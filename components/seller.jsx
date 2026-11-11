"use client";

import NotificationBell from "./notification-bell";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useAppNav, useAppMode, visibleNav } from "../lib/nav";
import {
  LayoutDashboard, ShoppingCart, Boxes, Package, Truck, Users, Building2, Receipt, BarChart3,
  UserCog, Sparkles, Settings, Sun, Moon, ChevronLeft, ChevronRight, X, History, LogOut,
  Plus, Upload, Trash2, ExternalLink, Eye, EyeOff, Send, RefreshCw, ShoppingBag, MessageCircle,
} from "lucide-react";

// Insight Store seller area: overview, listings (a publication layer over
// existing inventory products), order requests and the public store profile.

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "pos", label: "Point of Sale", icon: ShoppingCart },
  { key: "sales", label: "Sales", icon: History },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "products", label: "Products", icon: Package },
  { key: "purchases", label: "Purchases", icon: Truck },
  { key: "customers", label: "Customers", icon: Users },
  { key: "suppliers", label: "Suppliers", icon: Building2 },
  { key: "expenses", label: "Expenses", icon: Receipt },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "employees", label: "Employees", icon: UserCog },
  { key: "advanced", label: "Advanced Features", icon: Sparkles },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "logout", label: "Log out", icon: LogOut },
];

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "listings", label: "Listings" },
  { key: "orders", label: "Orders" },
  { key: "profile", label: "Store profile" },
];

const LISTING_STATUS = {
  DRAFT: ["Draft", "#5B6B63"], SUBMITTED: ["Submitted for review", "#1565C0"], UNDER_REVIEW: ["Under review", "#1565C0"],
  APPROVED: ["Approved", "#2E7D32"], PUBLISHED: ["Live", "#2E7D32"], REJECTED: ["Rejected", "#B3261E"], UNPUBLISHED: ["Unpublished", "#B7791F"],
};
const ORDER_STATUS = {
  NEW: ["New request", "#1565C0"], CONFIRMED: ["Confirmed", "#2E7D32"], AWAITING_PAYMENT: ["Awaiting payment", "#B7791F"], PAID: ["Paid", "#2E7D32"],
  PROCESSING: ["Processing", "#2E7D32"], READY_FOR_COLLECTION: ["Ready for collection", "#2E7D32"], DISPATCHED: ["Dispatched", "#2E7D32"],
  COMPLETED: ["Completed", "#145A32"], REJECTED: ["Rejected", "#B3261E"], CANCELLED: ["Cancelled", "#B3261E"], EXPIRED: ["Expired", "#5B6B63"],
};
// Mirrors ORDER_TRANSITIONS in lib/store/core.ts (the server enforces it).
const NEXT = {
  NEW: ["confirm", "reject"],
  CONFIRMED: ["awaiting_payment", "record_payment", "processing", "ready", "dispatch", "cancel"],
  AWAITING_PAYMENT: ["record_payment", "cancel"],
  PAID: ["processing", "ready", "dispatch", "complete", "cancel"],
  PROCESSING: ["ready", "dispatch", "complete", "record_payment", "cancel"],
  READY_FOR_COLLECTION: ["complete", "record_payment", "cancel"],
  DISPATCHED: ["complete", "record_payment"],
  CANCELLED: ["record_refund"],
};
const ACTION_LABEL = {
  confirm: "Confirm order (takes stock)", reject: "Reject", awaiting_payment: "Mark awaiting payment", record_payment: "Record payment received",
  processing: "Mark processing", ready: "Ready for collection", dispatch: "Mark dispatched", complete: "Mark completed", cancel: "Cancel order", record_refund: "Record refund",
};
const EVENT_LABEL = {
  PLACED: "Customer placed the request", WHATSAPP_LINK_OPENED: "Customer opened the WhatsApp link", CONFIRM: "Confirmed — stock taken from inventory", REJECT: "Rejected",
  AWAITING_PAYMENT: "Awaiting payment", PAYMENT_RECORDED: "Payment recorded", PROCESSING: "Processing", READY: "Ready for collection", DISPATCH: "Dispatched",
  COMPLETE: "Completed", CANCEL: "Cancelled", EXPIRED: "Expired without a response", REFUND_RECORDED: "Refund recorded",
};

const money = (n, cur = "GHS") => `${cur} ${Number(n ?? 0).toFixed(2)}`;
const when = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

async function api(url, init = {}) {
  const isForm = init.body instanceof FormData;
  try {
    const res = await fetch(url, { ...init, headers: isForm ? init.headers : { "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: "You're offline or the server can't be reached." } };
  }
}

export default function InsightSeller() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const active = "store";
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [focusOrder, setFocusOrder] = useState(null);

  const theme = useMemo(
    () =>
      dark
        ? { bg: "#0F1A14", surface: "#152420", border: "#26382F", text: "#EAF3EC", textMuted: "#9FB3A8", sidebar: "#0C1712", sidebarText: "#CFE3D6", sidebarActive: "#1E3B2A", input: "#1B2B25" }
        : { bg: "#F0FFF0", surface: "#FFFFFF", border: "#E5E7EB", text: "#1F2937", textMuted: "#5B6B63", sidebar: "#145A32", sidebarText: "#DDEDE2", sidebarActive: "#1F6E3F", input: "#FAFCFA" },
    [dark]
  );

  const loadProfile = useCallback(async () => {
    const r = await api("/api/seller/profile");
    if (!r.ok) { setProfileError(r.body.error ?? "Insight Store isn't available for your business."); return; }
    setProfileError(null);
    setProfile(r.body);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
    if (p.get("order")) setFocusOrder(p.get("order"));
    loadProfile();
  }, [loadProfile]);

  function go(t) {
    setTab(t);
    try { window.history.replaceState(null, "", `/seller?tab=${t}`); } catch {}
  }

  const ui = { theme, dark };
  const card = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18 };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: theme.bg, color: theme.text }}>
      <aside style={{ width: collapsed ? 68 : 232, background: theme.sidebar, color: theme.sidebarText, display: "flex", flexDirection: "column", transition: "width 0.18s ease", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: "18px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Insight</div>
              <div style={{ fontSize: 10.5, color: "rgba(221,237,226,0.6)", marginTop: 1 }}>by 9DEVs</div>
            </div>
          )}
          <button onClick={() => setCollapsed((c) => !c)} aria-label="Toggle navigation" style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 4, display: "flex" }}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {visibleNav(NAV_ITEMS, appMode).map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <button key={item.key} onClick={() => navigate(item.key)} title={collapsed ? item.label : undefined}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: collapsed ? "10px 0" : "10px 12px", justifyContent: collapsed ? "center" : "flex-start", marginBottom: 2, cursor: "pointer", border: "none", borderRadius: 6, background: isActive ? theme.sidebarActive : "transparent", color: isActive ? "#FFFFFF" : theme.sidebarText, fontSize: 13.5, fontWeight: isActive ? 600 : 500, textAlign: "left" }}>
                <Icon size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
        {!collapsed && (
          <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(221,237,226,0.55)" }}>
            Built by{" "}
            <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 600 }}>9DEVs</a>
          </div>
        )}
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.surface, gap: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><ShoppingBag size={18} color="#2E7D32" /> Insight Store</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>{profile?.businessName ?? "Seller area"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {profile?.seller?.slug && (
              <a href={`/store/s/${profile.seller.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: "#2E7D32", display: "flex", gap: 5, alignItems: "center" }}>View my store <ExternalLink size={13} /></a>
            )}
            <button onClick={() => setDark((d) => !d)} aria-label="Toggle theme" style={{ background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <NotificationBell theme={theme} dark={dark} />
          </div>
        </header>

        <main style={{ padding: 24, flex: 1, overflowY: "auto" }}>
          {profileError ? (
            <div style={{ ...card, maxWidth: 640 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Insight Store isn't available yet</div>
              <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 14 }}>{profileError}</div>
              <a href="/settings?section=store" style={{ color: "#2E7D32", fontWeight: 700, fontSize: 13 }}>Go to Settings → Insight Store</a>
            </div>
          ) : !profile ? (
            <div style={{ fontSize: 13, color: theme.textMuted }}>Loading…</div>
          ) : (
            <>
              {!profile.canSell && profile.blockedReason && (
                <div role="status" style={{ ...card, borderLeft: "3px solid #B7791F", marginBottom: 16, fontSize: 13 }}>{profile.blockedReason} You can view your listings and orders, but changes are paused.</div>
              )}
              {profile.canSell && !profile.seller.whatsappNumber && (
                <div role="status" style={{ ...card, borderLeft: "3px solid #B7791F", marginBottom: 16, fontSize: 13 }}>
                  Add a WhatsApp number in <button onClick={() => go("profile")} style={{ border: "none", background: "transparent", color: "#2E7D32", fontWeight: 700, cursor: "pointer", padding: 0 }}>Store profile</button> so customers can send you their orders.
                </div>
              )}
              <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: `1px solid ${theme.border}`, marginBottom: 18, overflowX: "auto" }}>
                {TABS.map((t) => (
                  <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)}
                    style={{ border: "none", background: "transparent", padding: "9px 14px", fontSize: 13.5, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? "#2E7D32" : theme.text, borderBottom: `2px solid ${tab === t.key ? "#2E7D32" : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {t.label}
                  </button>
                ))}
              </div>
              {tab === "overview" && <Overview {...ui} card={card} go={go} />}
              {tab === "listings" && <Listings {...ui} card={card} canManage={profile.canManage && profile.canSell} />}
              {tab === "orders" && <Orders {...ui} card={card} canManage={profile.canManage && profile.canSell} focus={focusOrder} clearFocus={() => setFocusOrder(null)} />}
              {tab === "profile" && <Profile {...ui} card={card} profile={profile} onSaved={loadProfile} canManage={profile.canManage && profile.canSell} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Pill({ map, status }) {
  const [label, color] = map[status] ?? [status, "#5B6B63"];
  return <span style={{ fontSize: 11.5, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap" }}>{label}</span>;
}

function Btn({ children, kind = "primary", theme, style, ...rest }) {
  const kinds = {
    primary: { border: "none", background: "#2E7D32", color: "#fff" },
    ghost: { border: `1px solid ${theme.border}`, background: "transparent", color: theme.text },
    danger: { border: "1px solid #B3261E", background: "transparent", color: "#B3261E" },
  };
  return <button {...rest} style={{ padding: "8px 14px", borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: rest.disabled ? "default" : "pointer", opacity: rest.disabled ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6, ...kinds[kind], ...style }}>{children}</button>;
}

function Msg({ msg }) {
  if (!msg) return null;
  return <div role="status" style={{ marginTop: 10, fontSize: 13, padding: "9px 12px", borderRadius: 6, color: msg.ok ? "#145A32" : "#B3261E", background: msg.ok ? "#E7F5EA" : "#FBE9E7" }}>{msg.text}</div>;
}

function Modal({ title, onClose, theme, children, width = 620 }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 40, padding: "4vh 12px", overflowY: "auto" }}>
      <div style={{ width: `min(${width}px, 100%)`, background: theme.surface, color: theme.text, borderRadius: 10, border: `1px solid ${theme.border}`, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "transparent", color: theme.text, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Overview({ theme, card, go }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api("/api/seller/insights").then((r) => (r.ok ? setData(r.body) : setErr(r.body.error))); }, []);
  if (err) return <div style={card}><Msg msg={{ ok: false, text: err }} /></div>;
  if (!data) return <div style={{ fontSize: 13, color: theme.textMuted }}>Loading overview…</div>;
  const o = data.ordersByStatus;
  const openCount = ["NEW", "CONFIRMED", "AWAITING_PAYMENT", "PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED"].reduce((s, k) => s + (o[k]?.count ?? 0), 0);
  const stats = [
    { label: "New requests", value: o.NEW?.count ?? 0, onClick: () => go("orders") },
    { label: "Open orders", value: openCount, onClick: () => go("orders") },
    { label: "Completed (30 days)", value: data.completed.count },
    { label: "Completed value (30 days)", value: money(data.completed.value) },
    { label: "Live listings", value: data.listingsByStatus.PUBLISHED ?? 0, onClick: () => go("listings") },
    { label: "Awaiting review", value: (data.listingsByStatus.SUBMITTED ?? 0) + (data.listingsByStatus.UNDER_REVIEW ?? 0), onClick: () => go("listings") },
  ];
  const channels = {};
  for (const c of data.channels) {
    channels[c.channel] = channels[c.channel] ?? { SHARE: 0, VISIT: 0, ORDER: 0 };
    channels[c.channel][c.event] = c.count;
  }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {stats.map((s) => (
          <button key={s.label} onClick={s.onClick} disabled={!s.onClick} style={{ ...card, textAlign: "left", cursor: s.onClick ? "pointer" : "default", color: theme.text }}>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{s.value}</div>
          </button>
        ))}
      </div>
      <div style={card}>
        <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Sharing and attribution (30 days)</div>
        <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 12 }}>Counts of taps on your share buttons, visits that arrived through shared links, and orders placed after such a visit. These are Insight's own counts; they don't come from Facebook, Instagram, TikTok or other networks.</div>
        {Object.keys(channels).length === 0 ? (
          <div style={{ fontSize: 13, color: theme.textMuted }}>No shares yet. Share your products from their store pages to start tracking.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}><th style={{ padding: 6 }}>Channel</th><th style={{ padding: 6 }}>Shares</th><th style={{ padding: 6 }}>Visits</th><th style={{ padding: 6 }}>Orders</th></tr></thead>
            <tbody>{Object.entries(channels).map(([ch, v]) => (
              <tr key={ch} style={{ borderTop: `1px solid ${theme.border}` }}><td style={{ padding: 6, textTransform: "capitalize" }}>{ch}</td><td style={{ padding: 6 }}>{v.SHARE}</td><td style={{ padding: 6 }}>{v.VISIT}</td><td style={{ padding: 6 }}>{v.ORDER}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Listings({ theme, dark, card, canManage }) {
  const [listings, setListings] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    const r = await api("/api/seller/listings");
    if (!r.ok) { setErr(r.body.error); return; }
    setErr(null);
    setListings(r.body.listings);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(l, action) {
    setBusy(`${l.id}:${action}`);
    const r = await api(`/api/seller/listings/${l.id}/action`, { method: "POST", body: JSON.stringify({ action }) });
    setMsg(r.ok ? { ok: true, text: action === "submit" ? `"${l.title}" was sent for review.` : action === "unpublish" ? `"${l.title}" is no longer on the marketplace.` : `"${l.title}" is live again.` } : { ok: false, text: r.body.error });
    setBusy(null);
    load();
  }
  async function toggle(l) {
    setBusy(`${l.id}:vis`);
    const r = await api(`/api/seller/listings/${l.id}`, { method: "PATCH", body: JSON.stringify({ isVisible: !l.isVisible }) });
    if (!r.ok) setMsg({ ok: false, text: r.body.error });
    setBusy(null);
    load();
  }
  async function remove(l) {
    if (!window.confirm?.(`Delete the listing "${l.title}"? The inventory product is not affected.`)) return;
    const r = await api(`/api/seller/listings/${l.id}`, { method: "DELETE" });
    setMsg(r.ok ? { ok: true, text: "Listing deleted. Your inventory product is unchanged." } : { ok: false, text: r.body.error });
    load();
  }

  if (err) return <div style={card}><Msg msg={{ ok: false, text: err }} /></div>;
  if (!listings) return <div style={{ fontSize: 13, color: theme.textMuted }}>Loading listings…</div>;
  const shown = listings.filter((l) => filter === "ALL" || l.status === filter);
  const th = { padding: "9px 10px", fontSize: 11.5, fontWeight: 600, color: theme.textMuted, textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "10px", fontSize: 13, borderTop: `1px solid ${theme.border}`, verticalAlign: "middle" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>Listings</div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status" style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12.5, background: theme.input, color: theme.text }}>
          <option value="ALL">All statuses</option>
          {Object.entries(LISTING_STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {canManage && <Btn theme={theme} style={{ marginLeft: "auto" }} onClick={() => setPicking(true)}><Plus size={15} /> List a product</Btn>}
      </div>
      <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 10 }}>Listings show products from your inventory. Stock always comes from your fulfilment branch, so marketplace orders and in-store sales draw on the same count. New listings and edits to live listings are reviewed by the Insight Store team before they appear.</div>
      <Msg msg={msg} />
      {listings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 10px", fontSize: 13, color: theme.textMuted }}>No listings yet. {canManage ? "Choose “List a product” to publish items from your inventory." : ""}</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Product</th><th style={th}>Status</th><th style={th}>Price</th><th style={th}>Available</th><th style={th}>Visible</th><th style={th}></th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id}>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: dark ? "#1B2B25" : "#EEF3EF", overflow: "hidden", flexShrink: 0 }}>
                        {l.images[0] && <img src={`/api/seller/listings/${l.id}/images/${l.images[0].id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      <div>
                        <button onClick={() => setEditing(l.id)} style={{ border: "none", background: "transparent", padding: 0, color: theme.text, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>{l.title}</button>
                        <div style={{ fontSize: 11.5, color: theme.textMuted }}>SKU {l.product.sku}{l.category ? ` · ${l.category.name}` : ""}</div>
                        {l.status === "REJECTED" && l.rejectionReason && <div style={{ fontSize: 11.5, color: "#B3261E" }}>Reason: {l.rejectionReason}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={td}><Pill map={LISTING_STATUS} status={l.status} /></td>
                  <td style={td}>{money(l.effectivePrice)}</td>
                  <td style={{ ...td, color: l.available <= 0 ? "#B3261E" : theme.text, fontWeight: l.available <= 0 ? 700 : 400 }}>{l.available <= 0 ? "Out of stock" : l.available}</td>
                  <td style={td}>
                    <button onClick={() => toggle(l)} disabled={!canManage || busy === `${l.id}:vis`} aria-label={l.isVisible ? "Hide from marketplace" : "Show on marketplace"} style={{ border: "none", background: "transparent", color: l.isVisible ? "#2E7D32" : theme.textMuted, cursor: canManage ? "pointer" : "default", display: "flex" }}>
                      {l.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                    {canManage && (l.status === "DRAFT" || l.status === "REJECTED") && <Btn theme={theme} style={{ padding: "6px 10px", fontSize: 12 }} disabled={!!busy} onClick={() => act(l, "submit")}><Send size={13} /> Submit</Btn>}
                    {canManage && l.status === "PUBLISHED" && <Btn kind="ghost" theme={theme} style={{ padding: "6px 10px", fontSize: 12 }} disabled={!!busy} onClick={() => act(l, "unpublish")}>Unpublish</Btn>}
                    {canManage && l.status === "UNPUBLISHED" && <Btn theme={theme} style={{ padding: "6px 10px", fontSize: 12 }} disabled={!!busy} onClick={() => act(l, "republish")}>Republish</Btn>}
                    {canManage && ["DRAFT", "REJECTED", "UNPUBLISHED"].includes(l.status) && (
                      <button aria-label={`Delete ${l.title}`} onClick={() => remove(l)} style={{ marginLeft: 6, border: "none", background: "transparent", color: "#B3261E", cursor: "pointer", verticalAlign: "middle" }}><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {picking && <ProductPicker theme={theme} onClose={() => setPicking(false)} onCreated={(id) => { setPicking(false); load(); setEditing(id); }} />}
      {editing && <ListingEditor theme={theme} dark={dark} id={editing} canManage={canManage} onClose={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ProductPicker({ theme, onClose, onCreated }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await api(`/api/seller/listings?candidates=1&q=${encodeURIComponent(q)}`);
      if (r.ok) setItems(r.body.products); else setErr(r.body.error);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function pick(p) {
    setBusy(p.id);
    const r = await api("/api/seller/listings", { method: "POST", body: JSON.stringify({ productId: p.id }) });
    setBusy(null);
    if (!r.ok) { setErr(r.body.error); return; }
    onCreated(r.body.listing.id);
  }
  return (
    <Modal title="List a product from your inventory" onClose={onClose} theme={theme}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU" style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "9px 11px", fontSize: 13, background: theme.input, color: theme.text, marginBottom: 10 }} />
      <Msg msg={err ? { ok: false, text: err } : null} />
      {!items ? <div style={{ fontSize: 13, color: theme.textMuted }}>Loading products…</div> : items.length === 0 ? (
        <div style={{ fontSize: 13, color: theme.textMuted, padding: "16px 0" }}>{q ? "No unlisted products match." : "All your active products are already listed, or you have no products yet. Add products in Inventory first."}</div>
      ) : (
        <div style={{ maxHeight: 380, overflowY: "auto" }}>
          {items.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>SKU {p.sku} · {money(p.sellingPrice)} · {p.available} available</div>
              </div>
              <Btn theme={theme} style={{ padding: "6px 12px", fontSize: 12 }} disabled={!!busy} onClick={() => pick(p)}>{busy === p.id ? "Adding…" : "List"}</Btn>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ListingEditor({ theme, dark, id, canManage, onClose }) {
  const [l, setL] = useState(null);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    const r = await api(`/api/seller/listings/${id}`);
    if (!r.ok) { setMsg({ ok: false, text: r.body.error }); return; }
    setL(r.body.listing);
    setForm({ title: r.body.listing.title, description: r.body.listing.description ?? "", price: r.body.listing.price ?? "", categoryId: r.body.listing.categoryId ?? "" });
  }, [id]);
  useEffect(() => {
    load();
    fetch("/api/store/public/categories").then((r) => (r.ok ? r.json() : null)).then((b) => b && setCats(b.categories)).catch(() => {});
  }, [load]);

  const locked = !canManage || (l && (l.status === "SUBMITTED" || l.status === "UNDER_REVIEW"));
  async function save() {
    setBusy("save");
    const price = form.price === "" ? null : Number(form.price);
    const r = await api(`/api/seller/listings/${id}`, { method: "PATCH", body: JSON.stringify({ title: form.title, description: form.description, price, categoryId: form.categoryId || null }) });
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.body.requiresReview ? "Saved. Because customers would see these changes, the listing is back in draft — submit it for review to put it live again." : "Saved." } : { ok: false, text: r.body.error });
    if (r.ok) load();
  }
  async function upload(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy("upload");
    const r = await api(`/api/seller/listings/${id}/images`, { method: "POST", body: fd });
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.body.requiresReview ? "Photo added. The listing is back in draft and needs review again." : "Photo added." } : { ok: false, text: r.body.error });
    load();
  }
  async function delImage(imageId) {
    const r = await api(`/api/seller/listings/${id}/images/${imageId}`, { method: "DELETE" });
    if (!r.ok) setMsg({ ok: false, text: r.body.error });
    load();
  }
  async function submit() {
    setBusy("submit");
    const r = await api(`/api/seller/listings/${id}/action`, { method: "POST", body: JSON.stringify({ action: "submit" }) });
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: "Sent for review. You'll be notified when it's live." } : { ok: false, text: r.body.error });
    load();
  }
  const input = { width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: theme.input, color: theme.text };
  const lab = { fontSize: 12.5, fontWeight: 600, marginBottom: 5, display: "block" };

  return (
    <Modal title={l ? l.title : "Listing"} onClose={onClose} theme={theme} width={680}>
      {!l || !form ? <div style={{ fontSize: 13, color: theme.textMuted }}>{msg?.text ?? "Loading…"}</div> : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <Pill map={LISTING_STATUS} status={l.status} />
            <span style={{ fontSize: 12.5, color: theme.textMuted }}>Inventory product: {l.product.name} (SKU {l.product.sku}) · {l.available} available</span>
          </div>
          {l.status === "REJECTED" && l.rejectionReason && <Msg msg={{ ok: false, text: `Not approved: ${l.rejectionReason}` }} />}
          {locked && canManage && <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 10 }}>This listing is being reviewed and can't be edited until a decision is made.</div>}
          <div style={{ marginBottom: 12 }}><label style={lab} htmlFor="le-title">Title</label><input id="le-title" style={input} maxLength={160} value={form.title} disabled={locked} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div><label style={lab} htmlFor="le-price">Store price</label><input id="le-price" style={input} type="number" min="0.01" step="0.01" placeholder={`${l.product.sellingPrice.toFixed(2)} (inventory price)`} value={form.price} disabled={locked} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><label style={lab} htmlFor="le-cat">Category</label>
              <select id="le-cat" style={input} value={form.categoryId} disabled={locked} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Choose…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lab} htmlFor="le-desc">Description</label><textarea id="le-desc" style={{ ...input, minHeight: 100 }} maxLength={4000} value={form.description} disabled={locked} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

          <div style={{ marginBottom: 12 }}>
            <span style={lab}>Photos</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {l.images.map((img) => (
                <div key={img.id} style={{ position: "relative", width: 84, height: 84, borderRadius: 6, overflow: "hidden", background: dark ? "#1B2B25" : "#EEF3EF" }}>
                  <img src={`/api/seller/listings/${id}/images/${img.id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {!locked && <button aria-label="Remove photo" onClick={() => delImage(img.id)} style={{ position: "absolute", top: 3, right: 3, border: "none", borderRadius: 4, background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", display: "flex", padding: 3 }}><Trash2 size={12} /></button>}
                </div>
              ))}
              {!locked && l.images.length < 6 && (
                <label style={{ width: 84, height: 84, borderRadius: 6, border: `1px dashed ${theme.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: theme.textMuted, cursor: "pointer", gap: 4 }}>
                  <Upload size={16} /> {busy === "upload" ? "Uploading…" : "Add photo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 6 }}>PNG, JPEG or WebP, up to 2 MB each, up to 6 photos.</div>
          </div>

          <Msg msg={msg} />
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {!locked && <Btn theme={theme} onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save changes"}</Btn>}
            {!locked && (l.status === "DRAFT" || l.status === "REJECTED") && <Btn kind="ghost" theme={theme} onClick={submit} disabled={!!busy}><Send size={13} /> Submit for review</Btn>}
            {l.status === "PUBLISHED" && <a href={`/store/p/${l.id}`} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "center", fontSize: 13, color: "#2E7D32", fontWeight: 600, display: "inline-flex", gap: 5, alignItems: "center" }}>View on Insight Store <ExternalLink size={13} /></a>}
          </div>

          {l.events?.length > 0 && (
            <div style={{ marginTop: 18, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>History</div>
              {l.events.map((e) => (
                <div key={e.id} style={{ fontSize: 12.5, padding: "4px 0", color: theme.textMuted }}>
                  <span style={{ color: theme.text, fontWeight: 600 }}>{e.action.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
                  {e.actorType === "PLATFORM_ADMIN" ? " · Insight Store team" : e.actorLabel ? ` · ${e.actorLabel}` : ""} · {when(e.createdAt)}{e.note ? ` — ${e.note}` : ""}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Orders({ theme, dark, card, canManage, focus, clearFocus }) {
  const [status, setStatus] = useState("OPEN");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(focus);
  const load = useCallback(async () => {
    const r = await api(`/api/seller/orders?status=${status}&q=${encodeURIComponent(q)}`);
    if (!r.ok) { setErr(r.body.error); return; }
    setErr(null);
    setData(r.body);
  }, [status, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { if (focus) setOpen(focus); }, [focus]);

  const filters = [["OPEN", "Open"], ["NEW", "New"], ["CONFIRMED", "Confirmed"], ["AWAITING_PAYMENT", "Awaiting payment"], ["READY_FOR_COLLECTION", "Ready"], ["DISPATCHED", "Dispatched"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"], ["REJECTED", "Rejected"], ["EXPIRED", "Expired"], ["", "All"]];
  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>Orders</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, customer or phone" aria-label="Search orders" style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "7px 10px", fontSize: 12.5, background: theme.input, color: theme.text, minWidth: 200 }} />
        <button onClick={load} aria-label="Refresh orders" style={{ marginLeft: "auto", border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, borderRadius: 6, padding: 7, cursor: "pointer", display: "flex" }}><RefreshCw size={14} /></button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {filters.map(([k, label]) => (
          <button key={k || "all"} onClick={() => setStatus(k)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 14, border: `1px solid ${status === k ? "#2E7D32" : theme.border}`, background: status === k ? (dark ? "#173C26" : "#E7F5EA") : "transparent", color: status === k ? "#2E7D32" : theme.text, fontWeight: status === k ? 700 : 500, cursor: "pointer" }}>
            {label}{k && data?.counts?.[k] ? ` (${data.counts[k]})` : ""}
          </button>
        ))}
      </div>
      {err ? <Msg msg={{ ok: false, text: err }} /> : !data ? <div style={{ fontSize: 13, color: theme.textMuted }}>Loading orders…</div> : data.orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 10px", fontSize: 13, color: theme.textMuted }}>No orders here yet. When customers order your products on Insight Store, they'll appear here and you'll get a notification.</div>
      ) : (
        <div>
          {data.orders.map((o) => (
            <button key={o.id} onClick={() => setOpen(o.id)} style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "11px 4px", border: "none", borderTop: `1px solid ${theme.border}`, background: "transparent", color: theme.text, cursor: "pointer" }}>
              <div style={{ minWidth: 120 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{o.reference}</div><div style={{ fontSize: 11.5, color: theme.textMuted }}>{when(o.createdAt)}</div></div>
              <div style={{ flex: 1, minWidth: 140 }}><div style={{ fontSize: 13 }}>{o.customerName}</div><div style={{ fontSize: 11.5, color: theme.textMuted }}>{o._count.items} item(s) · {o.fulfilment === "DELIVERY" ? "Delivery" : "Collection"}{o.attributionChannel ? ` · via ${o.attributionChannel}` : ""}</div></div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{money(o.subtotal, o.currency)}</div>
              <Pill map={ORDER_STATUS} status={o.status} />
              {o.paymentStatus === "PAID" && <span style={{ fontSize: 11, color: "#2E7D32", fontWeight: 700 }}>PAID</span>}
            </button>
          ))}
        </div>
      )}
      {open && <OrderDetail theme={theme} id={open} canManage={canManage} onClose={() => { setOpen(null); clearFocus(); load(); }} />}
    </div>
  );
}

function OrderDetail({ theme, id, canManage, onClose }) {
  const [o, setO] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await api(`/api/seller/orders/${id}`);
    if (!r.ok) setErr(r.body.error); else setO(r.body.order);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const needsNote = pending === "reject" || pending === "cancel";
  async function run(action) {
    setBusy(true);
    const r = await api(`/api/seller/orders/${id}/action`, { method: "POST", body: JSON.stringify({ action, note: note || null }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.body.error }); return; }
    setMsg({ ok: true, text: action === "confirm" ? "Order confirmed. The items were taken from your inventory." : action === "cancel" && o.stockDeducted ? "Order cancelled. The items were returned to your inventory." : "Order updated." });
    setPending(null);
    setNote("");
    load();
  }
  const actions = o ? (NEXT[o.status] ?? []).filter((a) => !(a === "record_payment" && o.paymentStatus === "PAID") && !(a === "record_refund" && o.paymentStatus !== "PAID") && !(a === "ready" && o.fulfilment !== "COLLECTION") && !(a === "dispatch" && o.fulfilment !== "DELIVERY")) : [];
  const waText = o ? encodeURIComponent(`Hello ${o.customerName}, this is about your Insight Store order ${o.reference}.`) : "";

  return (
    <Modal title={o ? `Order ${o.reference}` : "Order"} onClose={onClose} theme={theme} width={700}>
      {err ? <Msg msg={{ ok: false, text: err }} /> : !o ? <div style={{ fontSize: 13, color: theme.textMuted }}>Loading…</div> : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Pill map={ORDER_STATUS} status={o.status} />
            <span style={{ fontSize: 12.5, color: theme.textMuted }}>Payment {o.paymentStatus === "PAID" ? "recorded" : o.paymentStatus === "REFUNDED" ? "refunded" : "not recorded"} · placed {when(o.createdAt)}</span>
          </div>
          {o.status === "NEW" && <div style={{ fontSize: 12.5, marginTop: 8, color: "#B7791F" }}>Respond before {when(o.expiresAt)} or the request expires. No stock is held until you confirm.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, margin: "14px 0", fontSize: 13 }}>
            <div><div style={{ fontSize: 11.5, color: theme.textMuted }}>Customer</div><div style={{ fontWeight: 600 }}>{o.customerName}</div><div>+{o.customerPhone}</div>{o.customerEmail && <div>{o.customerEmail}</div>}</div>
            <div><div style={{ fontSize: 11.5, color: theme.textMuted }}>{o.fulfilment === "DELIVERY" ? "Delivery to" : "Fulfilment"}</div><div>{o.fulfilment === "DELIVERY" ? o.deliveryAddress : "Customer will collect"}</div>{o.branch && <div style={{ fontSize: 11.5, color: theme.textMuted }}>Stock from {o.branch.name}</div>}</div>
            {o.note && <div><div style={{ fontSize: 11.5, color: theme.textMuted }}>Customer note</div><div style={{ whiteSpace: "pre-wrap" }}>{o.note}</div></div>}
          </div>
          <a href={`https://wa.me/${o.customerPhone}?text=${waText}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#1FAF55", marginBottom: 12 }}><MessageCircle size={15} /> Message customer on WhatsApp</a>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.id} style={{ borderTop: `1px solid ${theme.border}` }}>
                  <td style={{ padding: "7px 4px" }}>{i.quantity} × {i.titleSnapshot}{i.skuSnapshot ? <span style={{ color: theme.textMuted, fontSize: 11.5 }}> · {i.skuSnapshot}</span> : null}
                    {i.available !== null && i.available < i.quantity && <div style={{ fontSize: 11.5, color: "#B3261E" }}>Only {i.available} in stock — adjust inventory or reject.</div>}
                  </td>
                  <td style={{ padding: "7px 4px", textAlign: "right" }}>{money(i.lineTotal, o.currency)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `1px solid ${theme.border}` }}><td style={{ padding: "7px 4px", fontWeight: 700 }}>Total</td><td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 800 }}>{money(o.subtotal, o.currency)}</td></tr>
            </tbody>
          </table>

          <Msg msg={msg} />
          {canManage && actions.length > 0 && !pending && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {actions.map((a) => (
                <Btn key={a} theme={theme} kind={a === "reject" || a === "cancel" ? "danger" : a === "confirm" || a === "complete" ? "primary" : "ghost"} disabled={busy} onClick={() => (a === "reject" || a === "cancel" || a === "confirm" || a === "record_payment" ? setPending(a) : run(a))}>
                  {ACTION_LABEL[a]}
                </Btn>
              ))}
            </div>
          )}
          {pending && (
            <div style={{ marginTop: 14, padding: 12, border: `1px solid ${theme.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {pending === "confirm" && "Confirm this order? The items will be taken from your inventory now."}
                {pending === "record_payment" && "Record that you've received payment for this order? Only do this once the money has actually reached you."}
                {pending === "reject" && "Why are you rejecting this order? The customer will see this."}
                {pending === "cancel" && `Why are you cancelling this order? The customer will see this.${o.stockDeducted ? " The items will be returned to your inventory." : ""}`}
              </div>
              {(needsNote || pending === "record_payment") && (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={needsNote ? "Reason" : "Payment method or reference (optional)"} style={{ width: "100%", minHeight: 60, border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, fontSize: 13, background: theme.input, color: theme.text }} />
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn theme={theme} kind={needsNote ? "danger" : "primary"} disabled={busy || (needsNote && !note.trim())} onClick={() => run(pending)}>{busy ? "Working…" : ACTION_LABEL[pending]}</Btn>
                <Btn theme={theme} kind="ghost" disabled={busy} onClick={() => { setPending(null); setNote(""); }}>Back</Btn>
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Timeline</div>
            {o.events.map((e) => (
              <div key={e.id} style={{ fontSize: 12.5, padding: "4px 0", color: theme.textMuted }}>
                <span style={{ color: theme.text, fontWeight: 600 }}>{EVENT_LABEL[e.action] ?? e.action}</span>{e.actorLabel ? ` · ${e.actorLabel}` : ""} · {when(e.createdAt)}{e.note ? ` — ${e.note}` : ""}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Profile({ theme, card, profile, onSaved, canManage }) {
  const s = profile.seller;
  const [form, setForm] = useState({
    description: s.description ?? "", city: s.city ?? "", region: s.region ?? "", country: s.country ?? "", publicPhone: s.publicPhone ?? "",
    whatsappNumber: s.whatsappNumber ? `+${s.whatsappNumber}` : "", publicEmail: s.publicEmail ?? "", openingHours: s.openingHours ?? "",
    offersDelivery: s.offersDelivery, deliveryInfo: s.deliveryInfo ?? "", offersCollection: s.offersCollection, collectionInfo: s.collectionInfo ?? "",
    fulfilmentBranchId: s.fulfilmentBranchId ?? "",
  });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/seller/profile", { method: "PATCH", body: JSON.stringify({ ...form, fulfilmentBranchId: form.fulfilmentBranchId || null }) });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Store profile saved." } : { ok: false, text: r.body.error });
    if (r.ok) onSaved();
  }
  const input = { width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: theme.input, color: theme.text };
  const lab = { fontSize: 12.5, fontWeight: 600, marginBottom: 5, display: "block" };
  const f = (k, label, props = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={lab} htmlFor={`sp-${k}`}>{label}</label>
      {props.textarea ? <textarea id={`sp-${k}`} style={{ ...input, minHeight: 70 }} value={form[k]} onChange={set(k)} disabled={!canManage} maxLength={props.max ?? 500} />
        : <input id={`sp-${k}`} style={input} value={form[k]} onChange={set(k)} disabled={!canManage} maxLength={props.max ?? 80} type={props.type ?? "text"} placeholder={props.placeholder} />}
      {props.help && <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 4 }}>{props.help}</div>}
    </div>
  );
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 14px" };
  return (
    <form style={{ ...card, maxWidth: 760 }} onSubmit={save}>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Store profile</div>
      <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 14 }}>
        This is what customers see on your Insight Store page: <a href={`/store/s/${s.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2E7D32", fontWeight: 600 }}>/store/s/{s.slug}</a>
      </div>
      {f("description", "About your business", { textarea: true, max: 2000 })}
      {f("whatsappNumber", "WhatsApp number for orders", { type: "tel", max: 40, placeholder: "+233 24 123 4567", help: "Customers' orders open a WhatsApp chat with this number. Local numbers starting with 0 are treated as Ghana (+233)." })}
      <div style={grid}>
        {f("publicPhone", "Public phone", { type: "tel", max: 40 })}
        {f("publicEmail", "Public email", { type: "email", max: 160 })}
        {f("city", "City")}
        {f("region", "Region")}
        {f("country", "Country")}
      </div>
      {f("openingHours", "Opening hours", { textarea: true, max: 300 })}
      <div style={{ marginBottom: 12 }}>
        <label style={lab} htmlFor="sp-branch">Fulfil orders from</label>
        <select id="sp-branch" style={input} value={form.fulfilmentBranchId} onChange={set("fulfilmentBranchId")} disabled={!canManage}>
          <option value="">Main branch</option>
          {profile.branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isMain ? " (main)" : ""}</option>)}
        </select>
        <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 4 }}>Marketplace availability and stock deductions use this branch's inventory.</div>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 10 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={form.offersCollection} onChange={set("offersCollection")} disabled={!canManage} /> Customers can collect</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={form.offersDelivery} onChange={set("offersDelivery")} disabled={!canManage} /> We deliver</label>
      </div>
      {form.offersCollection && f("collectionInfo", "Collection details", { textarea: true, help: "Where and when customers can collect." })}
      {form.offersDelivery && f("deliveryInfo", "Delivery details", { textarea: true, help: "Areas covered, fees and timing." })}
      <Msg msg={msg} />
      {canManage && <div style={{ marginTop: 14 }}><Btn theme={theme} type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Btn></div>}
    </form>
  );
}
