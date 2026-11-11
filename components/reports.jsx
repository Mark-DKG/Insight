"use client";

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
  Bell,
  Printer,
  FileDown,
  FileSpreadsheet,
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  PackageX,
  AlertTriangle,
  Archive,
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

const DATE_RANGES = ["Today", "This Week", "This Month", "Custom Range"];

const SALES_TREND = [
  { day: "Mon", sales: 4820 }, { day: "Tue", sales: 5120 }, { day: "Wed", sales: 4390 },
  { day: "Thu", sales: 6010 }, { day: "Fri", sales: 7240 }, { day: "Sat", sales: 8460 }, { day: "Sun", sales: 5680 },
];

const SALES_BY_CATEGORY = [
  { category: "Beverages", amount: 14820, share: 34 },
  { category: "Snacks", amount: 8940, share: 20 },
  { category: "Household", amount: 7320, share: 17 },
  { category: "Personal Care", amount: 6110, share: 14 },
  { category: "Dairy", amount: 6510, share: 15 },
];

const SALES_BY_EMPLOYEE = [
  { name: "Ama Owusu", sales: 18240, transactions: 142 },
  { name: "Kojo Mensah", sales: 15680, transactions: 118 },
  { name: "Efua Danso", sales: 9260, transactions: 74 },
];

const SALES_BY_PAYMENT = [
  { method: "Cash", amount: 16200 },
  { method: "Mobile Money", amount: 14380 },
  { method: "Card", amount: 6420 },
  { method: "Credit", amount: 4980 },
  { method: "Bank Transfer", amount: 1200 },
];

const PROFIT_TREND = [
  { day: "Mon", gross: 1540, net: 980 }, { day: "Tue", gross: 1690, net: 1080 },
  { day: "Wed", gross: 1310, net: 820 }, { day: "Thu", gross: 2040, net: 1360 },
  { day: "Fri", gross: 2510, net: 1740 }, { day: "Sat", gross: 2980, net: 2120 },
  { day: "Sun", gross: 1870, net: 1240 },
];

const PRODUCT_PROFITABILITY = [
  { name: "Coca-Cola 350ml", revenue: 4820, cost: 3278, profit: 1542, margin: 32 },
  { name: "Malta Guinness 330ml", revenue: 6110, cost: 3945, profit: 2165, margin: 35 },
  { name: "Indomie Chicken 70g", revenue: 3360, cost: 2016, profit: 1344, margin: 40 },
  { name: "Sunlight Cooking Oil 2L", revenue: 2880, cost: 2160, profit: 720, margin: 25 },
  { name: "Milo 400g Tin", revenue: 0, cost: 0, profit: 0, margin: 0 },
];

const STOCK_MOVEMENT = [
  { day: "Mon", in: 320, out: 210 }, { day: "Tue", in: 0, out: 245 }, { day: "Wed", in: 480, out: 198 },
  { day: "Thu", in: 0, out: 302 }, { day: "Fri", in: 150, out: 356 }, { day: "Sat", in: 0, out: 412 }, { day: "Sun", in: 0, out: 240 },
];

const DISCREPANCIES = [
  { product: "Malta Guinness 330ml", expected: 154, actual: 142, variance: -12, employee: "Ama Owusu", date: "5 Sep", impact: 78.0 },
  { product: "Dettol Soap 100g", expected: 8, actual: 3, variance: -5, employee: "Kojo Mensah", date: "3 Sep", impact: 28.0 },
  { product: "Milo 400g Tin", expected: 4, actual: 0, variance: -4, employee: "Ama Owusu", date: "1 Sep", impact: 114.0 },
];

const currency = (n) =>
  `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InsightReports() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active] = useState("reports");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  React.useEffect(() => {
    if (appMode === "INVENTORY_ONLY") setReportTab("inventory");
  }, [appMode]);
  const [reportTab, setReportTab] = useState("sales"); // sales | profit | inventory
  const [range, setRange] = useState("This Week");

  const [session, setSession] = useState(null);
  const [liveSales, setLiveSales] = useState(null);
  const [liveMovements, setLiveMovements] = useState(null);
  const [liveProfit, setLiveProfit] = useState(null);
  const [liveExpensesTotal, setLiveExpensesTotal] = useState(null);
  const [liveProducts, setLiveProducts] = useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [salesRes, profitRes, expensesRes, productsRes, meRes, movementsRes] = await Promise.all([
          fetch("/api/sales?limit=200"),
          fetch("/api/reports/profit"),
          fetch("/api/expenses"),
          fetch("/api/products?pageSize=100"),
          fetch("/api/auth/me"),
          fetch("/api/inventory/movements?limit=200"),
        ]);
        if (!cancelled && salesRes.ok) setLiveSales((await salesRes.json()).sales);
        if (!cancelled && profitRes.ok) setLiveProfit(await profitRes.json());
        if (!cancelled && expensesRes.ok) setLiveExpensesTotal((await expensesRes.json()).total);
        if (!cancelled && productsRes.ok) setLiveProducts((await productsRes.json()).items);
        if (!cancelled && meRes.ok) setSession((await meRes.json()).user);
        if (!cancelled && movementsRes.ok) setLiveMovements((await movementsRes.json()).movements);
      } catch {
        // Falls back to the static sample data throughout this screen.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const theme = useMemo(
    () =>
      dark
        ? {
            bg: "#0F1A14", surface: "#152420", surfaceAlt: "#1B2B25", border: "#26382F",
            text: "#EAF3EC", textMuted: "#9FB3A8", sidebar: "#0C1712", sidebarText: "#CFE3D6", sidebarActive: "#1E3B2A",
          }
        : {
            bg: "#F0FFF0", surface: "#FFFFFF", surfaceAlt: "#FFFFFF", border: "#E5E7EB",
            text: "#1F2937", textMuted: "#5B6B63", sidebar: "#145A32", sidebarText: "#DDEDE2", sidebarActive: "#1F6E3F",
          },
    [dark]
  );

  const primary = "#2E7D32";
  const deep = "#145A32";
  const bad = "#B3261E";
  const warn = "#B7791F";

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Groups live sales into the last 7 calendar days, oldest first, so the
  // trend charts below read the same shape ({ day, ... }) as the sample
  // data whether or not live data has loaded.
  const salesTrendLive = useMemo(() => {
    if (!liveSales) return null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: d.toDateString(), day: DAY_LABELS[d.getDay()], sales: 0, gross: 0 });
    }
    for (const sale of liveSales) {
      const key = new Date(sale.createdAt).toDateString();
      const bucket = days.find((d) => d.key === key);
      if (bucket) {
        bucket.sales += Number(sale.totalAmount);
        bucket.gross += Number(sale.grossProfit ?? 0);
      }
    }
    return days;
  }, [liveSales]);

  const salesByEmployeeLive = useMemo(() => {
    if (!liveSales) return null;
    const byEmployee = {};
    for (const sale of liveSales) {
      const name = sale.cashier?.name ?? "Unknown";
      if (!byEmployee[name]) byEmployee[name] = { name, sales: 0, transactions: 0 };
      byEmployee[name].sales += Number(sale.totalAmount);
      byEmployee[name].transactions += 1;
    }
    return Object.values(byEmployee).sort((a, b) => b.sales - a.sales);
  }, [liveSales]);

  const salesByPaymentLive = useMemo(() => {
    if (!liveSales) return null;
    const METHOD_LABEL = { CASH: "Cash", MOBILE_MONEY: "Mobile Money", BANK_TRANSFER: "Bank Transfer", CARD: "Card", CREDIT: "Credit", OTHER: "Other" };
    const byMethod = {};
    for (const sale of liveSales) {
      const method = METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod;
      byMethod[method] = (byMethod[method] ?? 0) + Number(sale.totalAmount);
    }
    return Object.entries(byMethod)
      .sort((a, b) => b[1] - a[1])
      .map(([method, amount]) => ({ method, amount }));
  }, [liveSales]);

  const stockMovementLive = useMemo(() => {
    if (!liveMovements) return null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: d.toDateString(), day: DAY_LABELS[d.getDay()], in: 0, out: 0 });
    }
    for (const m of liveMovements) {
      const key = new Date(m.createdAt).toDateString();
      const bucket = days.find((d) => d.key === key);
      if (!bucket) continue;
      if (m.quantity > 0) bucket.in += m.quantity;
      else bucket.out += Math.abs(m.quantity);
    }
    return days;
  }, [liveMovements]);

  const inventorySummaryLive = useMemo(() => {
    if (!liveProducts) return null;
    let value = 0, low = 0, out = 0;
    for (const p of liveProducts) {
      const qty = p.inventoryLevels?.reduce((s, l) => s + l.quantity, 0) ?? 0;
      value += Number(p.costPrice) * qty;
      if (qty === 0) out += 1;
      else if (qty <= p.minStockLevel) low += 1;
    }
    return { value, low, out };
  }, [liveProducts]);

  // Net profit isn't tracked per day (expenses don't carry a daily
  // breakdown), so the net line here spreads the period's total expenses
  // evenly across the 7 days as an approximation — the gross line per day
  // is exact, only the net split is estimated.
  const profitTrendLive = useMemo(() => {
    if (!salesTrendLive || liveExpensesTotal == null) return null;
    const dailyExpense = liveExpensesTotal / 7;
    return salesTrendLive.map((d) => ({ day: d.day, gross: d.gross, net: d.gross - dailyExpense }));
  }, [salesTrendLive, liveExpensesTotal]);

  const totalSales = liveProfit?.revenue ?? SALES_TREND.reduce((s, d) => s + d.sales, 0);
  const totalGross = liveProfit?.grossProfit ?? PROFIT_TREND.reduce((s, d) => s + d.gross, 0);
  const totalNet = liveProfit?.netProfit ?? PROFIT_TREND.reduce((s, d) => s + d.net, 0);
  const transactionCount = liveProfit?.transactionCount ?? 334;
  const margin = liveProfit ? liveProfit.netMarginPercent.toFixed(1) : ((totalNet / totalSales) * 100).toFixed(1);

  const ExportBar = () => (
    <div style={{ display: "flex", gap: 8 }}>
      {[
        { label: "Print", icon: Printer },
        { label: "Export PDF", icon: FileDown },
        { label: "Export CSV", icon: FileSpreadsheet },
      ].map((btn) => {
        const Icon = btn.icon;
        return (
          <button
            key={btn.label}
            style={{
              display: "flex", alignItems: "center", gap: 6, border: `1px solid ${theme.border}`,
              borderRadius: 6, padding: "7px 12px", fontSize: 12.5, background: "transparent",
              color: theme.text, cursor: "pointer", fontWeight: 600,
            }}
          >
            <Icon size={13} />
            {btn.label}
          </button>
        );
      })}
    </div>
  );

  const Card = ({ children, style }) => (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, ...style }}>
      {children}
    </div>
  );

  const Kpi = ({ label, value, color }) => (
    <Card>
      <div style={{ fontSize: 12.5, color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 700, marginTop: 8, color: color ?? theme.text }}>{value}</div>
    </Card>
  );

  const TableShell = ({ headers, children }) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );

  const td = { padding: "10px", borderBottom: `1px solid ${theme.border}` };

  return (
    <div style={{ display: "flex", minHeight: "600px", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: theme.bg, color: theme.text }}>
      {/* Sidebar */}
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
              <div key={item.key}
                onClick={() => navigate(item.key)} title={collapsed ? item.label : undefined} style={{
                display: "flex", alignItems: "center", gap: 12, padding: collapsed ? "10px 0" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start", marginBottom: 2,
                  cursor: "pointer", borderRadius: 6,
                background: isActive ? theme.sidebarActive : "transparent", color: isActive ? "#FFFFFF" : theme.sidebarText,
                fontSize: 13.5, fontWeight: isActive ? 600 : 500,
              }}>
                <Icon size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.surface, gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Reports</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>{session?.business?.name ?? "Your business"} · {session?.branch?.name ?? "Main Branch"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setDark((d) => !d)} aria-label="Toggle theme" style={{ background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button aria-label="Notifications" style={{ position: "relative", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}>
              <Bell size={16} />
              <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: bad }} />
            </button>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: deep, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>OA</div>
          </div>
        </header>

        <main style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {/* Controls row */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DATE_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 6,
                    border: `1px solid ${range === r ? primary : theme.border}`,
                    background: range === r ? primary : "transparent",
                    color: range === r ? "#fff" : theme.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {r === "Custom Range" && <Calendar size={13} />}
                  {r}
                </button>
              ))}
            </div>
            <ExportBar />
          </div>

          {/* Report type tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
            {[
              { key: "sales", label: "Sales" },
              { key: "profit", label: "Profit" },
              { key: "inventory", label: "Inventory" },
            ].filter((t) => appMode !== "INVENTORY_ONLY" || t.key === "inventory").map((t) => (
              <button
                key={t.key}
                onClick={() => setReportTab(t.key)}
                style={{
                  padding: "9px 14px", fontSize: 13.5, fontWeight: 600, background: "transparent", border: "none",
                  cursor: "pointer", color: reportTab === t.key ? primary : theme.textMuted,
                  borderBottom: reportTab === t.key ? `2px solid ${primary}` : "2px solid transparent", marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* SALES REPORT */}
          {reportTab === "sales" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <Kpi label="Total Sales" value={currency(totalSales)} color={primary} />
                <Kpi label="Transactions" value={String(transactionCount)} />
                <Kpi label="Avg. Transaction Value" value={currency(transactionCount ? totalSales / transactionCount : 0)} />
                <Kpi label="Top Category" value="—" />
              </div>

              <Card>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Sales Trend — {range}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>Actual</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={salesTrendLive ?? SALES_TREND} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={primary} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={primary} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: theme.textMuted }} axisLine={{ stroke: theme.border }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 12, borderRadius: 6 }} formatter={(v) => currency(v)} />
                    <Area type="monotone" dataKey="sales" name="Sales" stroke={primary} fill="url(#salesFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sales by Category</div>
                  {liveSales ? (
                    <div style={{ padding: "24px 12px", textAlign: "center", color: theme.textMuted, fontSize: 12.5 }}>
                      Not available yet — needs a per-item sales breakdown the app doesn't aggregate in bulk.
                    </div>
                  ) : (
                    <TableShell headers={["Category", "Amount", "Share"]}>
                      {SALES_BY_CATEGORY.map((c) => (
                        <tr key={c.category}>
                          <td style={td}>{c.category}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{currency(c.amount)}</td>
                          <td style={{ ...td, color: theme.textMuted }}>{c.share}%</td>
                        </tr>
                      ))}
                    </TableShell>
                  )}
                </Card>
                <Card>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sales by Employee</div>
                  <TableShell headers={["Employee", "Sales", "Transactions"]}>
                    {(salesByEmployeeLive ?? SALES_BY_EMPLOYEE).map((e) => (
                      <tr key={e.name}>
                        <td style={td}>{e.name}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{currency(e.sales)}</td>
                        <td style={{ ...td, color: theme.textMuted }}>{e.transactions}</td>
                      </tr>
                    ))}
                  </TableShell>
                </Card>
              </div>

              <Card>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sales by Payment Method</div>
                <TableShell headers={["Method", "Amount", "Share"]}>
                  {(salesByPaymentLive ?? SALES_BY_PAYMENT).map((p) => (
                    <tr key={p.method}>
                      <td style={td}>{p.method}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{currency(p.amount)}</td>
                      <td style={{ ...td, color: theme.textMuted }}>{((p.amount / totalSales) * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </TableShell>
              </Card>
            </div>
          )}

          {/* PROFIT REPORT */}
          {reportTab === "profit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <Kpi label="Gross Profit" value={currency(totalGross)} color={primary} />
                <Kpi label="Net Profit" value={currency(totalNet)} color={primary} />
                <Kpi label="Profit Margin" value={`${margin}%`} />
                <Kpi label="Best Day" value="Saturday" />
              </div>

              <Card>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Profit Trend — {range}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>
                  {profitTrendLive ? "Gross profit is exact per day; net profit spreads total expenses evenly across the period." : "Actual"}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={profitTrendLive ?? PROFIT_TREND} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grossFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={deep} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={deep} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={primary} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={primary} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: theme.textMuted }} axisLine={{ stroke: theme.border }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 12, borderRadius: 6 }} formatter={(v) => currency(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="gross" name="Gross Profit" stroke={deep} fill="url(#grossFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="net" name="Net Profit" stroke={primary} fill="url(#netFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Product Profitability</div>
                {liveSales ? (
                  <div style={{ padding: "24px 12px", textAlign: "center", color: theme.textMuted, fontSize: 12.5 }}>
                    Not available yet — needs a per-item sales breakdown the app doesn't aggregate in bulk.
                  </div>
                ) : (
                <TableShell headers={["Product", "Revenue", "Cost", "Profit", "Margin"]}>
                  {PRODUCT_PROFITABILITY.map((p) => (
                    <tr key={p.name}>
                      <td style={td}>{p.name}</td>
                      <td style={{ ...td, color: theme.textMuted }}>{currency(p.revenue)}</td>
                      <td style={{ ...td, color: theme.textMuted }}>{currency(p.cost)}</td>
                      <td style={{ ...td, fontWeight: 700, color: p.profit > 0 ? primary : theme.textMuted }}>{currency(p.profit)}</td>
                      <td style={td}>
                        {p.revenue > 0 ? (
                          <span style={{ color: p.margin >= 30 ? primary : p.margin >= 15 ? warn : bad, fontWeight: 600 }}>{p.margin}%</span>
                        ) : (
                          <span style={{ color: theme.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                            <TrendingDown size={12} /> No sales this period
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </TableShell>
                )}
              </Card>
            </div>
          )}

          {/* INVENTORY REPORT */}
          {reportTab === "inventory" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <Kpi label="Inventory Value" value={currency(inventorySummaryLive?.value ?? 184320)} />
                <Kpi label="Low Stock Items" value={String(inventorySummaryLive?.low ?? 23)} color={warn} />
                <Kpi label="Out of Stock" value={String(inventorySummaryLive?.out ?? 6)} color={bad} />
                <Kpi label="Dead Stock Value" value="—" color={theme.textMuted} />
              </div>

              <Card>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Stock Movement — {range}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>Units in vs. units out</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stockMovementLive ?? STOCK_MOVEMENT} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: theme.textMuted }} axisLine={{ stroke: theme.border }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 12, borderRadius: 6 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="in" name="Stock In" fill={primary} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="out" name="Stock Out" fill={theme.textMuted} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <AlertTriangle size={15} color={bad} />
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Stock Discrepancies</div>
                </div>
                {liveMovements ? (
                  <div style={{ padding: "24px 12px", textAlign: "center", color: theme.textMuted, fontSize: 12.5 }}>
                    No stock count feature is set up yet — discrepancies are detected by comparing a physical count against expected stock, which the app doesn't yet support.
                  </div>
                ) : (
                <TableShell headers={["Product", "Expected", "Actual", "Variance", "Employee", "Date", "Est. Impact"]}>
                  {DISCREPANCIES.map((d, i) => (
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 600 }}>{d.product}</td>
                      <td style={td}>{d.expected}</td>
                      <td style={td}>{d.actual}</td>
                      <td style={{ ...td, color: bad, fontWeight: 700 }}>{d.variance}</td>
                      <td style={{ ...td, color: theme.textMuted }}>{d.employee}</td>
                      <td style={{ ...td, color: theme.textMuted }}>{d.date}</td>
                      <td style={{ ...td, color: bad, fontWeight: 600 }}>{currency(d.impact)}</td>
                    </tr>
                  ))}
                </TableShell>
                )}
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
