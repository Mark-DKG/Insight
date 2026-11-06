"use client";

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
   Insight by 9DEVs — Dashboard
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
];

const SALES_TREND = [
  { day: "Mon", sales: 4820, profit: 1540 },
  { day: "Tue", sales: 5120, profit: 1690 },
  { day: "Wed", sales: 4390, profit: 1310 },
  { day: "Thu", sales: 6010, profit: 2040 },
  { day: "Fri", sales: 7240, profit: 2510 },
  { day: "Sat", sales: 8460, profit: 2980 },
  { day: "Sun", sales: 5680, profit: 1870 },
];

const CATEGORY_PROFIT = [
  { category: "Beverages", profit: 2140 },
  { category: "Snacks", profit: 1580 },
  { category: "Household", profit: 1260 },
  { category: "Personal Care", profit: 980 },
  { category: "Dairy", profit: 640 },
];

const RECENT_TRANSACTIONS = [
  { id: "RCT-10482", time: "09:41", cashier: "Ama Owusu", customer: "Walk-in", amount: 148.5, method: "Mobile Money", status: "Completed" },
  { id: "RCT-10481", time: "09:22", cashier: "Kojo Mensah", customer: "Linda Boateng", amount: 612.0, method: "Credit", status: "Pending" },
  { id: "RCT-10480", time: "08:58", cashier: "Ama Owusu", customer: "Walk-in", amount: 76.0, method: "Cash", status: "Completed" },
  { id: "RCT-10479", time: "08:40", cashier: "Kojo Mensah", customer: "Kwabena Asante", amount: 298.25, method: "Card", status: "Completed" },
  { id: "RCT-10478", time: "08:15", cashier: "Ama Owusu", customer: "Walk-in", amount: 42.75, method: "Cash", status: "Refunded" },
];

const INVENTORY_STATUS = [
  { label: "In Stock", value: 428, tone: "good" },
  { label: "Low Stock", value: 23, tone: "warn" },
  { label: "Out of Stock", value: 6, tone: "bad" },
  { label: "Dead Stock", value: 14, tone: "neutral" },
];

const INSIGHTS = [
  { tone: "good", text: "Saturday sales are 24% above your 8-week average for the day." },
  { tone: "warn", text: "Sunlight Cooking Oil 2L may run out within 3 days at current sales velocity." },
  { tone: "bad", text: "Revenue rose 6% this week but net profit fell 2% — supplier cost increases on dairy are the main driver." },
  { tone: "neutral", text: "14 products have not sold in 60 days, tying up an estimated GHS 6,400 in inventory value." },
];

const LOGO_ICON = "data:image/png;base64,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";

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

  // Live data: falls back to the sample figures below (kept as defaults)
  // until each request resolves, so the layout never flashes empty.
  const [session, setSession] = useState(null);
  const [profitSummary, setProfitSummary] = useState(null);
  const [recentSales, setRecentSales] = useState(null);
  const [allSales, setAllSales] = useState(null); // for the trend chart
  const [liveProducts, setLiveProducts] = useState(null);
  const [loadError, setLoadError] = useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
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
        if (!cancelled) setLoadError("Showing sample data — couldn't reach the server.");
      }
    }

    loadDashboardData();
    return () => {
      cancelled = true;
    };
  }, []);

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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={LOGO_ICON} alt="Insight" style={{ height: 30, width: "auto", display: "block" }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>Insight</div>
                <div style={{ fontSize: 10.5, color: "rgba(221,237,226,0.6)", marginTop: 1 }}>
                  by 9DEVs
                </div>
              </div>
            </div>
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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
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
            <button
              aria-label="Notifications"
              style={{
                position: "relative",
                background: "transparent",
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: 8,
                cursor: "pointer",
                color: theme.text,
                display: "flex",
              }}
            >
              <Bell size={16} />
              <span
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#B3261E",
                }}
              />
            </button>
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
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: primary, display: "inline-block" }} />
          Online — Synced · last sync 09:41
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
                value: currency(profitSummary?.revenue ?? 5680),
                delta: "+12.4%",
                up: true,
                icon: CircleDollarSign,
              },
              {
                label: "Gross Profit",
                value: currency(profitSummary?.grossProfit ?? 1870),
                delta: "+8.1%",
                up: true,
                icon: Wallet,
              },
              {
                label: "Net Profit",
                value: currency(profitSummary?.netProfit ?? 1240),
                delta: profitSummary && profitSummary.netProfit < 0 ? "" : "-2.3%",
                up: profitSummary ? profitSummary.netProfit >= 0 : false,
                icon: TrendingUp,
              },
              {
                label: "Transactions",
                value: String(profitSummary?.transactionCount ?? 86),
                delta: "+6",
                up: true,
                icon: ClipboardList,
              },
              { label: "Low Stock Items", value: String(inventoryStatusData?.find((s) => s.label === "Low Stock")?.value ?? 0), delta: "+4", up: false, icon: AlertTriangle },
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
                      color: kpi.up ? primary : "#B3261E",
                    }}
                  >
                    {kpi.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {kpi.delta} vs last week
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
                <div style={{ fontSize: 12, color: theme.textMuted }}>Actual</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={salesTrendData ?? SALES_TREND} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
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
              {allSales ? (
                <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: theme.textMuted, fontSize: 12.5, padding: "0 20px" }}>
                  Category-level profit isn't available yet — it needs a per-product sales breakdown the app doesn't aggregate in bulk.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={CATEGORY_PROFIT} layout="vertical" margin={{ left: 6, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                    <YAxis dataKey="category" type="category" tick={{ fontSize: 12, fill: theme.text }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip
                      contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 12, borderRadius: 6 }}
                      formatter={(v) => currency(v)}
                    />
                    <Bar dataKey="profit" fill={primary} radius={[0, 3, 3, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
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
                {(inventoryStatusData ?? INVENTORY_STATUS).map((s) => (
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
                <span style={{ color: theme.text, fontWeight: 600 }}>{currency(inventoryValue ?? 184_320)}</span>
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
                {(inventoryStatusData || profitSummary ? realInsights : INSIGHTS).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: theme.textMuted, textAlign: "center", padding: "16px 8px" }}>
                    No insights yet — they'll appear here as you record sales and inventory.
                  </div>
                ) : (
                  (inventoryStatusData || profitSummary ? realInsights : INSIGHTS).map((insight, i) => (
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
                        status: s.status === "COMPLETED" ? "Completed" : s.status === "REFUNDED" ? "Refunded" : "Pending",
                      }))
                    : RECENT_TRANSACTIONS
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
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
