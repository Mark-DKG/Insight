"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useAppNav } from "../lib/nav";
import { buildReceiptFromSale, printReceipt, shareReceipt } from "../lib/receipt";
import {
  LayoutDashboard, ShoppingCart, Boxes, Package, Truck, Users, Building2, Receipt, BarChart3,
  UserCog, Sparkles, Settings, Sun, Moon, ChevronLeft, ChevronRight, X, Printer, Share2,
  Ban, Undo2, History, LogOut,
} from "lucide-react";

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

const METHOD_LABEL = {
  CASH: "Cash", MOBILE_MONEY: "Mobile Money", BANK_TRANSFER: "Bank Transfer",
  CARD: "Card", CREDIT: "Credit", OTHER: "Other",
};

export default function InsightSales() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active] = useState("sales");
  const navigate = useAppNav();

  const [session, setSession] = useState(null);
  const [sales, setSales] = useState(null); // null = loading
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const [detail, setDetail] = useState(null); // { sale, business }
  const [detailLoading, setDetailLoading] = useState(false);
  const [reverseKind, setReverseKind] = useState(null); // "VOID" | "REFUND"
  const [reason, setReason] = useState("");
  const [reverseError, setReverseError] = useState("");
  const [reversing, setReversing] = useState(false);
  const [note, setNote] = useState("");

  const theme = useMemo(
    () =>
      dark
        ? { bg: "#0F1A14", surface: "#152420", border: "#26382F", text: "#EAF3EC", textMuted: "#9FB3A8", sidebar: "#0C1712", sidebarText: "#CFE3D6", sidebarActive: "#1E3B2A", input: "#1B2B25" }
        : { bg: "#F0FFF0", surface: "#FFFFFF", border: "#E5E7EB", text: "#1F2937", textMuted: "#5B6B63", sidebar: "#145A32", sidebarText: "#DDEDE2", sidebarActive: "#1F6E3F", input: "#FAFCFA" },
    [dark]
  );
  const primary = "#2E7D32";
  const deep = "#145A32";
  const bad = "#B3261E";
  const warn = "#B7791F";

  const currencyCode = session?.business?.currency ?? "GHS";
  const money = (n) => `${currencyCode} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const canVoid = session?.role === "OWNER" || session?.role === "MANAGER";

  const loadSales = useCallback(async () => {
    try {
      const res = await fetch("/api/sales?limit=100");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body?.error ?? "Could not load sales.");
        setSales([]);
        return;
      }
      setLoadError("");
      setSales(body.sales);
    } catch {
      setLoadError("Couldn't reach the server.");
      setSales([]);
    }
  }, []);

  useEffect(() => {
    loadSales();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setSession(b.user))
      .catch(() => {});
  }, [loadSales]);

  const openDetail = async (id) => {
    setDetailLoading(true);
    setDetail(null);
    setReverseKind(null);
    setReason("");
    setReverseError("");
    setNote("");
    try {
      const res = await fetch(`/api/sales/${id}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) setDetail(body);
      else setNote(body?.error ?? "Could not load this sale.");
    } catch {
      setNote("Couldn't reach the server.");
    } finally {
      setDetailLoading(false);
    }
  };

  const submitReverse = async () => {
    if (!detail || !reverseKind) return;
    setReversing(true);
    setReverseError("");
    try {
      const res = await fetch(`/api/sales/${detail.sale.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: reverseKind, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReverseError(body?.error ?? "Could not complete this action.");
        return;
      }
      setReverseKind(null);
      setReason("");
      await Promise.all([loadSales(), openDetail(detail.sale.id)]);
    } catch {
      setReverseError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setReversing(false);
    }
  };

  const statusStyle = (status) => {
    if (status === "COMPLETED") return { color: primary, bg: dark ? "#173C26" : "#E7F5EA", label: "Completed" };
    if (status === "VOIDED") return { color: bad, bg: dark ? "#3A1D1B" : "#FBE9E7", label: "Voided" };
    if (status === "REFUNDED") return { color: warn, bg: dark ? "#33291A" : "#FFF4E0", label: "Refunded" };
    return { color: theme.textMuted, bg: dark ? "#1B2B25" : "#F3F5F4", label: status };
  };

  const visible = (sales ?? []).filter((s) => {
    if (filter !== "ALL" && s.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.receiptNumber.toLowerCase().includes(q) ||
      (s.customer?.name ?? "walk-in").toLowerCase().includes(q) ||
      (s.cashier?.name ?? "").toLowerCase().includes(q)
    );
  });

  const th = { padding: "10px 12px", fontSize: 11.5, fontWeight: 600, color: theme.textMuted, textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "11px 12px", fontSize: 13, borderTop: `1px solid ${theme.border}` };

  const receipt = detail ? buildReceiptFromSale(detail) : null;

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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <div key={item.key} onClick={() => navigate(item.key)} title={collapsed ? item.label : undefined}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: collapsed ? "10px 0" : "10px 12px", justifyContent: collapsed ? "center" : "flex-start", marginBottom: 2, cursor: "pointer", borderRadius: 6, background: isActive ? theme.sidebarActive : "transparent", color: isActive ? "#FFFFFF" : theme.sidebarText, fontSize: 13.5, fontWeight: isActive ? 600 : 500 }}>
                <Icon size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </div>
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
            <div style={{ fontSize: 17, fontWeight: 700 }}>Sales</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>{session?.business?.name ?? "Your business"}</div>
          </div>
          <button onClick={() => setDark((d) => !d)} aria-label="Toggle theme" style={{ background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main style={{ padding: 24, flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search receipt, customer or cashier"
              aria-label="Search sales"
              style={{ flex: "1 1 240px", maxWidth: 360, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: theme.input, color: theme.text }}
            />
            <div style={{ display: "flex", border: `1px solid ${theme.border}`, borderRadius: 6, overflow: "hidden" }}>
              {[["ALL", "All"], ["COMPLETED", "Completed"], ["VOIDED", "Voided"], ["REFUNDED", "Refunded"]].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)}
                  style={{ padding: "7px 12px", fontSize: 12.5, border: "none", cursor: "pointer", fontWeight: 600, background: filter === k ? primary : "transparent", color: filter === k ? "#fff" : theme.text }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, overflowX: "auto" }}>
            {sales === null ? (
              <div style={{ padding: 28, fontSize: 13, color: theme.textMuted }}>Loading sales…</div>
            ) : loadError ? (
              <div style={{ padding: 28, fontSize: 13, color: bad }}>{loadError}</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: 36, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{sales.length === 0 ? "No sales have been recorded yet." : "No sales match your filters."}</div>
                {sales.length === 0 && (
                  <button onClick={() => navigate("pos")} style={{ marginTop: 14, border: "none", borderRadius: 6, padding: "9px 16px", background: primary, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    Open Point of Sale
                  </button>
                )}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Receipt", "Date", "Cashier", "Customer", "Payment", "Total", "Status"].map((h) => (
                      <th key={h} style={{ ...th, textAlign: h === "Total" ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => {
                    const st = statusStyle(s.status);
                    return (
                      <tr key={s.id} onClick={() => openDetail(s.id)} style={{ cursor: "pointer" }}>
                        <td style={{ ...td, fontWeight: 600 }}>{s.receiptNumber}</td>
                        <td style={td}>{new Date(s.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                        <td style={td}>{s.cashier?.name ?? "—"}</td>
                        <td style={td}>{s.customer?.name ?? "Walk-in"}</td>
                        <td style={td}>{METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{money(s.totalAmount)}</td>
                        <td style={td}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, color: st.color, background: st.bg }}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {(detail || detailLoading || note) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", justifyContent: "flex-end", zIndex: 20 }}
             onClick={(e) => { if (e.target === e.currentTarget) { setDetail(null); setNote(""); } }}>
          <div style={{ width: "min(440px, 100vw)", background: theme.surface, borderLeft: `1px solid ${theme.border}`, padding: 22, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{detail ? detail.sale.receiptNumber : "Sale"}</div>
              <button aria-label="Close" onClick={() => { setDetail(null); setNote(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.text, display: "flex" }}>
                <X size={18} />
              </button>
            </div>

            {detailLoading && <div style={{ fontSize: 13, color: theme.textMuted }}>Loading…</div>}
            {note && <div style={{ fontSize: 13, color: bad }}>{note}</div>}

            {detail && receipt && (
              <>
                <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 12 }}>
                  {new Date(detail.sale.createdAt).toLocaleString()} · {detail.sale.cashier?.name} · {detail.sale.branch?.name}
                </div>
                {detail.sale.status !== "COMPLETED" && (
                  <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12.5, fontWeight: 600, color: statusStyle(detail.sale.status).color, background: statusStyle(detail.sale.status).bg }}>
                    {statusStyle(detail.sale.status).label}
                    {detail.sale.voidedReason ? `: ${detail.sale.voidedReason}` : ""}
                  </div>
                )}
                <div style={{ borderTop: `1px dashed ${theme.border}`, borderBottom: `1px dashed ${theme.border}`, padding: "10px 0", marginBottom: 12 }}>
                  {detail.sale.items.map((i) => (
                    <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                      <span>{i.quantity} × {i.product?.name}</span>
                      <span>{money(Number(i.unitPrice) * i.quantity)}</span>
                    </div>
                  ))}
                </div>
                {Number(detail.sale.discountAmount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>
                    <span>Discount</span><span>-{money(detail.sale.discountAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>
                  <span>Customer</span><span>{receipt.customer}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>
                  <span>Payment</span><span>{METHOD_LABEL[detail.sale.paymentMethod]}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, margin: "10px 0 16px" }}>
                  <span>Total</span><span>{money(detail.sale.totalAmount)}</span>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button onClick={() => { if (!printReceipt(receipt)) setNote("Allow pop-ups for this site to print."); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 6, border: "none", background: primary, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    <Printer size={14} /> Print
                  </button>
                  <button onClick={() => shareReceipt(receipt)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 6, border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    <Share2 size={14} /> Share
                  </button>
                </div>

                {detail.sale.status === "COMPLETED" && canVoid && !reverseKind && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setReverseKind("VOID")}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 6, border: `1px solid ${bad}`, background: "transparent", color: bad, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                      <Ban size={14} /> Void
                    </button>
                    <button onClick={() => setReverseKind("REFUND")}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 6, border: `1px solid ${warn}`, background: "transparent", color: warn, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                      <Undo2 size={14} /> Refund
                    </button>
                  </div>
                )}

                {reverseKind && (
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 14, marginTop: 4 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
                      {reverseKind === "VOID" ? "Void this sale?" : "Refund this sale in full?"}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>
                      Stock is returned to the branch{detail.sale.paymentMethod === "CREDIT" ? " and the customer's unpaid credit is reversed" : ""}. The sale stays on record and this cannot be undone.
                    </div>
                    <label htmlFor="reverse-reason" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>Reason</label>
                    <input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned items"
                      style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: theme.input, color: theme.text, boxSizing: "border-box" }} />
                    {reverseError && <div style={{ fontSize: 12.5, color: bad, marginTop: 8 }}>{reverseError}</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={() => { setReverseKind(null); setReverseError(""); }} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                        Cancel
                      </button>
                      <button onClick={submitReverse} disabled={reversing || reason.trim().length < 3}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "none", background: reverseKind === "VOID" ? bad : warn, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: reversing || reason.trim().length < 3 ? 0.6 : 1 }}>
                        {reversing ? "Working…" : reverseKind === "VOID" ? "Confirm void" : "Confirm refund"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
