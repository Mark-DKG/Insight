"use client";

import NotificationBell from "./notification-bell";

import { useAppNav, useAppMode, visibleNav } from "../lib/nav";
import { LogOut as LogOutIcon, History as HistoryIcon } from "lucide-react";

import React, { useState, useMemo } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Package,
  Truck,
  Users,
  Building2,
  Receipt,
  BarChart3,
  UserCog,
  Sparkles,
  Settings,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  PackageX,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CircleDollarSign,
  ClipboardList,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";

/* ---------------------------------------------------------
   Insight — Dashboard
   Token system (per brand spec):
   Honeydew   #F0FFF0  light-mode background
   Primary    #2E7D32  buttons / active nav / positive
   Deep Green #145A32  sidebar / brand / high emphasis
   White      #FFFFFF  cards / tables
   Charcoal   #1F2937  text / icons
   Light Gray #E5E7EB  borders / dividers
--------------------------------------------------------- */

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "pos", label: "Point of Sale", icon: ShoppingCart },
  { key: "sales", label: "Sales", icon: HistoryIcon },
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
  { key: "logout", label: "Log out", icon: LogOutIcon },
];

const LOGO_ICON = "/brand/insight-mark-light.png";
const LOGO_FULL = "/brand/insight-logo-light.png";

const currency = (n) =>
  `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function useTheme() {
  const [dark, setDark] = useState(false);
  return { dark, toggle: () => setDark((d) => !d) };
}

export default function InsightDashboard() {
  const { dark, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("dashboard");
  const navigate = useAppNav();
  const appMode = useAppMode(active);

  // Live data only. Until a request resolves a section shows a loading
  // state; if it fails the section says so (with a retry). No placeholder or
  // sample figures are ever shown in place of real data.
  const [session, setSession] = useState(null);
  const [profitSummary, setProfitSummary] = useState(null);
  const [recentSales, setRecentSales] = useState(null);
  const [allSales, setAllSales] = useState(null); // for the trend chart
  const [liveProducts, setLiveProducts] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadState, setLoadState] = useState("loading"); // loading | ok | error
  const [reloadKey, setReloadKey] = useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      setLoadState("loading");
      setLoadError("");
      let failed = false;
      try {
        const [meRes, profitRes, salesRes, allSalesRes, productsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/reports/profit"),
          fetch("/api/sales?limit=5"),
          fetch("/api/sales?limit=200"),
          fetch("/api/products?pageSize=100"),
        ]);

        if (!cancelled && meRes.ok) {
          const meBody = await meRes.json();
          setSession(meBody.user);
        }
        if (!cancelled) {
          // A section the person's package/permissions don't include (403) is
          // not an error; anything else that isn't OK is.
          const bad = (r) => !r.ok && r.status !== 403;
          if (bad(profitRes) || bad(salesRes) || bad(allSalesRes) || bad(productsRes)) failed = true;
        }
        if (!cancelled && profitRes.ok) {
          setProfitSummary(await profitRes.json());
        }
        if (!cancelled && salesRes.ok) {
          const salesBody = await salesRes.json();
          setRecentSales(salesBody.sales);
        }
        if (!cancelled && allSalesRes.ok) {
          setAllSales((await allSalesRes.json()).sales);
        }
        if (!cancelled && productsRes.ok) {
          setLiveProducts((await productsRes.json()).items);
        }
      } catch {
        failed = true;
      }
      if (!cancelled) {
        setLoadState(failed ? "error" : "ok");
        if (failed) setLoadError("Some figures couldn't be loaded from the server. Nothing below is estimated.");
      }
    }

    loadDashboardData();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // A value that hasn't loaded is never replaced by a made-up one: it reads
  // "…" while loading and "Unavailable" if the request failed. A real zero
  // stays a zero.
  const unavailable = loadState === "error" ? "Unavailable" : "…";
  const showMoney = (v) => (v === null || v === undefined ? unavailable : currency(Number(v)));
  const showCount = (v) => (v === null || v === undefined ? unavailable : String(v));
  const CAP = 100; // the server returns at most 100 sales / 100 products per request

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const salesTrendData = useMemo(() => {
    if (!allSales) return null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: d.toDateString(), day: DAY_LABELS[d.getDay()], sales: 0, profit: 0 });
    }
    for (const sale of allSales) {
      const key = new Date(sale.createdAt).toDateString();
      const bucket = days.find((d) => d.key === key);
      if (bucket) {
        bucket.sales += Number(sale.totalAmount);
        bucket.profit += Number(sale.grossProfit ?? 0);
      }
    }
    return days;
  }, [allSales]);

  const inventoryStatusData = useMemo(() => {
    if (!liveProducts) return null;
    let inStock = 0, low = 0, out = 0;
    for (const p of liveProducts) {
      const qty = p.inventoryLevels?.reduce((s, l) => s + l.quantity, 0) ?? 0;
      if (qty === 0) out += 1;
      else if (qty <= p.minStockLevel) low += 1;
      else inStock += 1;
    }
    return [
      { label: "In Stock", value: inStock, tone: "good" },
      { label: "Low Stock", value: low, tone: "warn" },
      { label: "Out of Stock", value: out, tone: "bad" },
    ];
  }, [liveProducts]);

  const inventoryValue = useMemo(() => {
    if (!liveProducts) return null;
    return liveProducts.reduce((sum, p) => {
      const qty = p.inventoryLevels?.reduce((s, l) => s + l.quantity, 0) ?? 0;
      return sum + Number(p.costPrice) * qty;
    }, 0);
  }, [liveProducts]);

  // Real, minimal observations computed from what's actually loaded —
  // deliberately not the elaborate narrative-style insights a fuller
  // analytics engine might produce, since fabricating those would be
  // exactly the kind of mockup this pass removes.
  const realInsights = useMemo(() => {
    const items = [];
    if (inventoryStatusData) {
      const out = inventoryStatusData.find((s) => s.label === "Out of Stock")?.value ?? 0;
      const low = inventoryStatusData.find((s) => s.label === "Low Stock")?.value ?? 0;
      if (out > 0) items.push({ tone: "bad", text: `${out} product${out === 1 ? " is" : "s are"} out of stock.` });
      if (low > 0) items.push({ tone: "warn", text: `${low} product${low === 1 ? " is" : "s are"} below its minimum stock level.` });
    }
    if (profitSummary) {
      if (profitSummary.netProfit < 0) {
        items.push({ tone: "bad", text: "Net profit is currently negative — expenses exceed gross profit for this period." });
      } else if (profitSummary.transactionCount === 0) {
        items.push({ tone: "neutral", text: "No sales recorded yet." });
      }
    }
    return items;
  }, [inventoryStatusData, profitSummary]);

  const theme = useMemo(
    () =>
      dark
        ? {
            bg: "#0F1A14",
            surface: "#152420",
            surfaceAlt: "#1B2B25",
            border: "#26382F",
            text: "#EAF3EC",
            textMuted: "#9FB3A8",
            sidebar: "#0C1712",
            sidebarText: "#CFE3D6",
            sidebarActive: "#1E3B2A",
          }
        : {
            bg: "#F0FFF0",
            surface: "#FFFFFF",
            surfaceAlt: "#FFFFFF",
            border: "#E5E7EB",
            text: "#1F2937",
            textMuted: "#5B6B63",
            sidebar: "#145A32",
            sidebarText: "#DDEDE2",
            sidebarActive: "#1F6E3F",
          },
    [dark]
  );

  const primary = "#2E7D32";
  const deep = "#145A32";

  const toneColor = (tone) =>
    tone === "good" ? primary : tone === "warn" ? "#B7791F" : tone === "bad" ? "#B3261E" : theme.textMuted;

  const statusStyle = (status) => {
    if (status === "Completed") return { color: primary, bg: dark ? "#173C26" : "#E7F5EA" };
    if (status === "Pending") return { color: "#B7791F", bg: dark ? "#3B2E13" : "#FBF0DD" };
    return { color: "#B3261E", bg: dark ? "#3B1616" : "#FBE9E7" };
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "600px",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: theme.bg,
        color: theme.text,
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? 68 : 232,
          background: theme.sidebar,
          color: theme.sidebarText,
          display: "flex",
          flexDirection: "column",
          transition: "width 0.18s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            padding: "18px 16px",
            borderBottom: `1px solid rgba(255,255,255,0.08)`,
          }}
        >
          {!collapsed && (
            <img src={LOGO_FULL} alt="Insight" style={{ height: 30, width: "auto", display: "block" }} />
          )}
          {collapsed && (
            <img src={LOGO_ICON} alt="Insight" style={{ height: 26, width: "auto", display: "block", margin: "0 auto" }} />
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {visibleNav(NAV_ITEMS, appMode).map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                
                title={collapsed ? item.label : undefined}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: collapsed ? "10px 0" : "10px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  marginBottom: 2,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? theme.sidebarActive : "transparent",
                  color: isActive ? "#FFFFFF" : theme.sidebarText,
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  textAlign: "left",
                }}
              >
                <Icon size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!collapsed && (
          <div
            style={{
              padding: "14px 16px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              fontSize: 11,
              color: "rgba(221,237,226,0.55)",
            }}
          >
            Built by{" "}
            <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 600 }}>9DEVs</a>
            {" "}· v1.0
          </div>
        )}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 24px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.surface,
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Dashboard</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>
              {session?.business?.name ?? "Your business"} ·{" "}
              {session?.branch?.name ?? "Main Branch"} ·{" "}
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, maxWidth: 380 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: "7px 10px",
                width: "100%",
                background: dark ? theme.surfaceAlt : "#FAFCFA",
              }}
            >
              <Search size={15} color={theme.textMuted} />
              <input
                placeholder="Search products, customers, receipts…"
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 13,
                  color: theme.text,
                  width: "100%",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <NotificationBell theme={theme} dark={dark} />
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: 8,
                cursor: "pointer",
                color: theme.text,
                display: "flex",
              }}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: deep,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {session?.name
                ? session.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()
                : "OA"}
            </div>
          </div>
        </header>

        {/* Sync status strip */}
        <div
          style={{
            padding: "7px 24px",
            fontSize: 12,
            color: theme.textMuted,
            background: dark ? "#122019" : "#F5FBF6",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: loadState === "error" ? "#B3261E" : primary, display: "inline-block" }} />
          {loadState === "error" ? loadError : loadState === "loading" ? "Loading your figures…" : "Figures loaded from the server."}
          {loadState === "error" && (
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: primary, background: "transparent", border: `1px solid ${primary}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}
            >
              Retry
            </button>
          )}
        </div>

        {/* Content */}
        <main style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {/* KPI row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              marginBottom: 20,
            }}
          >
            {[
              {
                label: "Total Sales",
                value: showMoney(profitSummary?.revenue),
                note: "All recorded sales",
                icon: CircleDollarSign,
              },
              {
                label: "Gross Profit",
                value: showMoney(profitSummary?.grossProfit),
                note: "All recorded sales",
                icon: Wallet,
              },
              {
                label: "Net Profit",
                value: showMoney(profitSummary?.netProfit),
                note: "After recorded expenses",
                icon: TrendingUp,
              },
              {
                label: "Transactions",
                value: showCount(profitSummary?.transactionCount),
                note: "Completed sales",
                icon: ClipboardList,
              },
              { label: "Low Stock Items", value: showCount(inventoryStatusData?.find((s) => s.label === "Low Stock")?.value), note: liveProducts && liveProducts.length >= CAP ? "First 100 products only" : "Right now", icon: AlertTriangle },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 12.5, color: theme.textMuted }}>{kpi.label}</div>
                    <Icon size={16} color={theme.textMuted} />
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, marginTop: 8 }}>{kpi.value}</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 6,
                      fontSize: 12,
                      color: theme.textMuted,
                    }}
                  >
                    {kpi.note}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charts row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: 18,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Sales & Profit — This Week</div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>{allSales && allSales.length >= CAP ? "Based on the latest 100 sales" : "Recorded sales"}</div>
              </div>
              {!salesTrendData ? (
                <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted, fontSize: 12.5 }}>
                  {loadState === "error" ? "Sales trend unavailable — couldn't load sales." : "Loading sales…"}
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={salesTrendData} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={primary} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={primary} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={deep} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={deep} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: theme.textMuted }} axisLine={{ stroke: theme.border }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip
                    contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 12, borderRadius: 6 }}
                    formatter={(v) => currency(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke={primary} fill="url(#salesFill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" name="Gross Profit" stroke={deep} fill="url(#profitFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>

            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Profit by Category</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>This week</div>
              <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: theme.textMuted, fontSize: 12.5, padding: "0 20px" }}>
                Category-level profit isn't available yet — it needs a per-product sales breakdown the app doesn't aggregate in bulk.
              </div>
            </div>
          </div>

          {/* Inventory + Insights row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.3fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Inventory Status</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {!inventoryStatusData && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: theme.textMuted, padding: "10px 0" }}>
                    {loadState === "error" ? "Inventory status unavailable — couldn't load products." : "Loading products…"}
                  </div>
                )}
                {(inventoryStatusData ?? []).map((s) => (
                  <div
                    key={s.label}
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontSize: 11.5, color: theme.textMuted }}>{s.label}</div>
                    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, color: toneColor(s.tone) }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: `1px solid ${theme.border}`,
                  fontSize: 12.5,
                  color: theme.textMuted,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Total inventory value</span>
                <span style={{ color: theme.text, fontWeight: 600 }}>
                  {showMoney(inventoryValue)}
                  {liveProducts && liveProducts.length >= CAP ? " (first 100 products)" : ""}
                </span>
              </div>
            </div>

            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Business Insights</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {realInsights.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: theme.textMuted, textAlign: "center", padding: "16px 8px" }}>
                    {inventoryStatusData || profitSummary ? "No insights yet — they'll appear here as you record sales and inventory." : loadState === "error" ? "Insights unavailable — couldn't load your data." : "Loading…"}
                  </div>
                ) : (
                  realInsights.map((insight, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: toneColor(insight.tone),
                        marginTop: 5,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>{insight.text}</span>
                  </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: 18,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Recent Transactions</div>
              <button
                style={{
                  fontSize: 12.5,
                  color: primary,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                View all
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                    {["Receipt", "Time", "Cashier", "Customer", "Amount", "Method", "Status"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(recentSales
                    ? recentSales.map((s) => ({
                        id: s.receiptNumber,
                        time: new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        cashier: s.cashier?.name ?? "—",
                        customer: s.customer?.name ?? "Walk-in",
                        amount: Number(s.totalAmount),
                        method: s.paymentMethod?.replace("_", " ") ?? "—",
                        status: s.status === "COMPLETED" ? "Completed" : s.status === "REFUNDED" ? "Refunded" : s.status === "VOIDED" ? "Voided" : "Pending",
                      }))
                    : []
                  ).map((t) => {
                    const s = statusStyle(t.status);
                    return (
                      <tr key={t.id}>
                        <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{t.id}</td>
                        <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{t.time}</td>
                        <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{t.cashier}</td>
                        <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{t.customer}</td>
                        <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{currency(t.amount)}</td>
                        <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{t.method}</td>
                        <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: "3px 8px",
                              borderRadius: 4,
                              color: s.color,
                              background: s.bg,
                            }}
                          >
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(!recentSales || recentSales.length === 0) && (
                <div style={{ padding: "18px 10px", fontSize: 12.5, color: theme.textMuted, textAlign: "center" }}>
                  {!recentSales
                    ? loadState === "error" ? "Recent transactions unavailable — couldn't load sales." : "Loading recent transactions…"
                    : "No sales recorded yet."}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
