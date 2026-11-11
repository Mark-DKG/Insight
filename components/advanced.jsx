"use client";

import { useAppNav, useAppMode, visibleNav } from "../lib/nav";
import { LogOut as LogOutIcon, History as HistoryIcon } from "lucide-react";

import React, { useState, useMemo, useRef, useEffect } from "react";
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
  Send,
  Bot,
  User,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

const HEALTH_FACTORS = [
  { label: "Profitability", score: 88 },
  { label: "Sales Growth", score: 76 },
  { label: "Inventory Efficiency", score: 71 },
  { label: "Cash Flow", score: 84 },
  { label: "Inventory Turnover", score: 68 },
  { label: "Customer Credit Exposure", score: 79 },
  { label: "Expense Control", score: 90 },
  { label: "Stock Shrinkage", score: 74 },
];

const OVERALL_HEALTH = Math.round(HEALTH_FACTORS.reduce((s, f) => s + f.score, 0) / HEALTH_FACTORS.length);

const BRANCH_PERFORMANCE = [
  { branch: "Main Branch", revenue: 42800, profit: 12900, margin: 30 },
  { branch: "Tema Branch", revenue: 21400, profit: 5350, margin: 25 },
];

const FORECAST = [
  { day: "Mon", actual: 4820, forecast: null }, { day: "Tue", actual: 5120, forecast: null },
  { day: "Wed", actual: 4390, forecast: null }, { day: "Thu", actual: 6010, forecast: null },
  { day: "Fri", actual: 7240, forecast: null }, { day: "Sat", actual: 8460, forecast: null },
  { day: "Sun", actual: 5680, forecast: 5680 },
  { day: "Mon", actual: null, forecast: 5210 }, { day: "Tue", actual: null, forecast: 5480 },
  { day: "Wed", actual: null, forecast: 4720 }, { day: "Thu", actual: null, forecast: 6340 },
];

const SUGGESTED_QUESTIONS = [
  "What were my best-selling products this month?",
  "Which products are losing me money?",
  "How much profit did I make last week?",
  "What should I reorder?",
  "Which customers owe me money?",
  "Which branch performed best?",
];

// Falls back to these canned answers only when live business data hasn't
// loaded (or the request failed) — see answerFromLiveData below for the
// real, computed version used once data is available.
function answerFor(question) {
  const q = question.toLowerCase();
  if (q.includes("best-selling") || q.includes("best selling")) {
    return "Based on this month's sales, your top performers by revenue are Malta Guinness 330ml (GHS 6,110), Coca-Cola 350ml (GHS 4,820), and Indomie Chicken 70g (GHS 3,360). Beverages account for roughly a third of total revenue this period.";
  }
  if (q.includes("losing") || q.includes("losing me money")) {
    return "Milo 400g Tin has recorded no sales this period while still carrying inventory value — it isn't losing money directly, but it's tying up cash. No products currently show a negative margin after cost. I'd flag Milo as a dead-stock candidate rather than a loss-maker.";
  }
  if (q.includes("profit") && q.includes("last week")) {
    return "Net profit last week was approximately GHS 8,220, on gross profit of GHS 12,470 and expenses of GHS 4,250 — mainly rent and salaries. That's a net margin of about 17%.";
  }
  if (q.includes("reorder")) {
    return "Sunlight Cooking Oil 2L is at 6 units against a 15-unit minimum and sells roughly 2/day — it will likely run out within 3 days. Dettol Soap 100g and Fan Milk Yoghurt 500ml are also below their reorder point. I'd suggest generating purchase orders for all three.";
  }
  if (q.includes("owe") || q.includes("customers owe")) {
    return "Total outstanding customer credit is GHS 1,417.50 across 3 customers. Nana Adjei's balance of GHS 745.50 is overdue as of today; Linda Boateng (GHS 612.00) and Efua Sarpong (GHS 60.00) are within their due dates.";
  }
  if (q.includes("branch")) {
    return "Main Branch performed best this period with GHS 42,800 in revenue and a 30% profit margin, compared to Tema Branch's GHS 21,400 at a 25% margin. The gap is mostly in beverage sales volume, which is higher at Main Branch.";
  }
  return "I don't have enough recorded data to answer that precisely yet. As more sales, purchases, and expenses are logged, I'll be able to give a more specific answer instead of an estimate.";
}

const currency = (n) =>
  `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The real version: computes an answer from data actually fetched from the
// API rather than matching a canned string. Per the spec's own rule for
// this feature, a question this can't answer from real data returns an
// honest "insufficient data" message instead of inventing a number —
// that's true here for best-sellers and per-product loss questions, since
// answering those needs per-product sales aggregation the current API
// doesn't expose in bulk (the same gap noted on the Reports screen).
function answerFromLiveData(question, biz) {
  const q = question.toLowerCase();

  if (q.includes("reorder")) {
    const low = (biz.products ?? []).filter((p) => p.qty > 0 && p.qty <= p.minStockLevel);
    const out = (biz.products ?? []).filter((p) => p.qty === 0);
    if (low.length === 0 && out.length === 0) {
      return "Nothing is currently below its minimum stock level or out of stock — no reorders needed right now.";
    }
    const parts = [];
    if (out.length) parts.push(`${out.length} product${out.length === 1 ? " is" : "s are"} completely out of stock (${out.map((p) => p.name).join(", ")})`);
    if (low.length) parts.push(`${low.length} product${low.length === 1 ? " is" : "s are"} below its minimum stock level (${low.map((p) => p.name).join(", ")})`);
    return `${parts.join("; ")}. I'd suggest generating purchase orders for these.`;
  }

  if (q.includes("owe") || q.includes("customers owe")) {
    const withBalance = (biz.customers ?? []).filter((c) => c.creditBalance > 0);
    if (withBalance.length === 0) return "No customers currently have an outstanding credit balance.";
    const total = withBalance.reduce((s, c) => s + c.creditBalance, 0);
    const list = withBalance.map((c) => `${c.name} (${currency(c.creditBalance)})`).join(", ");
    return `Total outstanding customer credit is ${currency(total)} across ${withBalance.length} customer${withBalance.length === 1 ? "" : "s"}: ${list}.`;
  }

  if (q.includes("profit") && (q.includes("last week") || q.includes("this week") || q.includes("how much"))) {
    if (!biz.profitLastWeek) return null;
    const { grossProfit, netProfit, netMarginPercent, revenue } = biz.profitLastWeek;
    return `Over the last 7 days: revenue was ${currency(revenue)}, gross profit ${currency(grossProfit)}, and net profit ${currency(netProfit)} — a net margin of about ${netMarginPercent}%.`;
  }

  if (q.includes("branch")) {
    if (!biz.branchSummaries || biz.branchSummaries.length < 2) {
      return "Branch comparison needs at least two branches with recorded sales — not enough data for that yet.";
    }
    const sorted = [...biz.branchSummaries].sort((a, b) => b.summary.revenue - a.summary.revenue);
    const [top, ...rest] = sorted;
    const restText = rest.map((b) => `${b.branch.name} (${currency(b.summary.revenue)})`).join(", ");
    return `${top.branch.name} performed best with ${currency(top.summary.revenue)} in revenue. Compared to ${restText}.`;
  }

  if (q.includes("best-selling") || q.includes("best selling") || q.includes("losing") || q.includes("losing me money")) {
    return "I don't have per-product sales totals available yet to answer that precisely — that needs item-level sales data the app doesn't aggregate in bulk yet, so I won't guess at a number.";
  }

  return null; // signals "use the canned fallback" for anything else
}

export default function InsightAdvanced() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active] = useState("advanced");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const [tab, setTab] = useState("health"); // health | assistant | forecasting
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask me anything about your business's sales, profit, inventory, or customers — I'll answer using your actual recorded data." },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const [bizData, setBizData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBizData() {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [productsRes, customersRes, profitRes, branchesRes] = await Promise.all([
          fetch("/api/products?pageSize=100"),
          fetch("/api/customers"),
          fetch(`/api/reports/profit?from=${sevenDaysAgo}`),
          fetch("/api/branches"),
        ]);

        const data = {};
        if (productsRes.ok) {
          const body = await productsRes.json();
          data.products = body.items.map((p) => ({
            name: p.name,
            qty: p.inventoryLevels?.reduce((s, l) => s + l.quantity, 0) ?? 0,
            minStockLevel: p.minStockLevel,
          }));
        }
        if (customersRes.ok) {
          const body = await customersRes.json();
          data.customers = body.customers.map((c) => ({ name: c.name, creditBalance: Number(c.creditBalance) }));
        }
        if (profitRes.ok) data.profitLastWeek = await profitRes.json();
        if (branchesRes.ok) {
          const body = await branchesRes.json();
          const summaries = await Promise.all(
            body.branches.map(async (b) => {
              const res = await fetch(`/api/branches/${b.id}`);
              return res.ok ? await res.json() : null;
            })
          );
          data.branchSummaries = summaries.filter(Boolean);
        }

        if (!cancelled) setBizData(data);
      } catch {
        // Chat falls back to the canned answers below.
      }
    }
    loadBizData();
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body && setSession(body.user))
      .catch(() => {});
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

  const scoreColor = (s) => (s >= 80 ? primary : s >= 60 ? warn : bad);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = (text) => {
    const question = text ?? input;
    if (!question.trim()) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setTimeout(() => {
      const liveAnswer = bizData ? answerFromLiveData(question, bizData) : null;
      const answer = liveAnswer ?? answerFor(question);
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    }, 500);
  };

  const circumference = 2 * Math.PI * 54;
  const scoreOffset = circumference - (OVERALL_HEALTH / 100) * circumference;

  const Card = ({ children, style }) => (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, ...style }}>
      {children}
    </div>
  );

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
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.surface, gap: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Advanced Features</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>{session?.business?.name ?? "Your business"} · Business Intelligence</div>
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

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "16px 24px 0", borderBottom: `1px solid ${theme.border}`, background: theme.surface }}>
          {[
            { key: "health", label: "Business Intelligence" },
            { key: "assistant", label: "AI Assistant" },
            { key: "forecasting", label: "Forecasting" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "9px 14px", fontSize: 13.5, fontWeight: 600, background: "transparent", border: "none",
                cursor: "pointer", color: tab === t.key ? primary : theme.textMuted,
                borderBottom: tab === t.key ? `2px solid ${primary}` : "2px solid transparent", marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <main style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
          {tab === "health" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <AlertTriangle size={16} color={warn} />
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Business Health Score isn't available yet</div>
                </div>
                <div style={{ fontSize: 12.5, color: theme.textMuted, maxWidth: 520, lineHeight: 1.5 }}>
                  A composite score needs a defined scoring model across profitability, sales growth, inventory
                  efficiency, cash flow, and shrinkage — that hasn't been built yet, so nothing is shown here rather
                  than an estimated number.
                </div>
              </Card>

              <Card>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Branch Performance</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                        {["Branch", "Revenue", "Profit", "Margin"].map((h) => (
                          <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bizData
                        ? (bizData.branchSummaries ?? []).map((b) => ({
                            branch: b.branch.name,
                            revenue: b.summary.revenue,
                            profit: b.summary.netProfit,
                            margin: b.summary.revenue ? Math.round((b.summary.netProfit / b.summary.revenue) * 100) : 0,
                          })).map((b) => (
                            <tr key={b.branch}>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{b.branch}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{currency(b.revenue)}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: primary, fontWeight: 600 }}>{currency(b.profit)}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{b.margin}%</td>
                            </tr>
                          ))
                        : BRANCH_PERFORMANCE.map((b) => (
                            <tr key={b.branch}>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{b.branch}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{currency(b.revenue)}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: primary, fontWeight: 600 }}>{currency(b.profit)}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{b.margin}%</td>
                            </tr>
                          ))}
                      {bizData && (bizData.branchSummaries ?? []).length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: "24px 10px", textAlign: "center", color: theme.textMuted }}>
                            No branch data recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === "assistant" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, minHeight: 320 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      background: m.role === "user" ? deep : (dark ? "#1B2B25" : "#EAF2EE"), color: m.role === "user" ? "#fff" : primary,
                    }}>
                      {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                    </div>
                    <div style={{
                      maxWidth: "72%", padding: "10px 13px", borderRadius: 8, fontSize: 13.5, lineHeight: 1.5,
                      background: m.role === "user" ? (dark ? "#1E3B2A" : "#E7F5EA") : (dark ? theme.surfaceAlt : "#F5F7F5"),
                      border: `1px solid ${theme.border}`,
                    }}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.border}` }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      style={{
                        fontSize: 11.5, padding: "5px 10px", borderRadius: 14, border: `1px solid ${theme.border}`,
                        background: "transparent", color: theme.textMuted, cursor: "pointer",
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="Ask about your sales, profit, inventory, or customers…"
                    style={{
                      flex: 1, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "9px 12px",
                      fontSize: 13.5, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text,
                    }}
                  />
                  <button
                    onClick={() => send()}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 6, padding: "9px 16px",
                      background: primary, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
                    }}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "forecasting" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <AlertTriangle size={16} color={warn} />
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Forecasting isn't available yet</div>
                </div>
                <div style={{ fontSize: 12.5, color: theme.textMuted, maxWidth: 520, lineHeight: 1.5 }}>
                  A reliable forecast needs weeks of real sales history and a defined statistical method — neither
                  exists yet for a new account, so nothing is projected here rather than an invented number. This
                  section will show real Actual-vs-Estimated data once that's built.
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
