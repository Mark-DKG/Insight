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
  Search,
  Bell,
  Plus,
  Home,
  Zap,
  Car,
  Wallet,
  Wrench,
  Megaphone,
  Wifi,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  X,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

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

const CATEGORY_ICONS = {
  Rent: Home,
  Utilities: Zap,
  Transport: Car,
  Salaries: Wallet,
  Maintenance: Wrench,
  Marketing: Megaphone,
  Internet: Wifi,
  Other: MoreHorizontal,
};

const EXPENSES = [
  { id: "EXP-0142", date: "6 Sep", category: "Rent", description: "September shop rent", amount: 3500.0, method: "Bank Transfer", user: "Owusu Ansah" },
  { id: "EXP-0141", date: "5 Sep", category: "Utilities", description: "ECG electricity bill", amount: 480.0, method: "Mobile Money", user: "Owusu Ansah" },
  { id: "EXP-0140", date: "5 Sep", category: "Transport", description: "Delivery van fuel", amount: 220.0, method: "Cash", user: "Kojo Mensah" },
  { id: "EXP-0139", date: "3 Sep", category: "Salaries", description: "Cashier salaries — August", amount: 4200.0, method: "Bank Transfer", user: "Owusu Ansah" },
  { id: "EXP-0138", date: "2 Sep", category: "Maintenance", description: "Fridge repair", amount: 350.0, method: "Cash", user: "Ama Owusu" },
  { id: "EXP-0137", date: "1 Sep", category: "Internet", description: "Monthly internet subscription", amount: 180.0, method: "Card", user: "Owusu Ansah" },
  { id: "EXP-0136", date: "30 Aug", category: "Marketing", description: "Facebook promotion", amount: 150.0, method: "Card", user: "Owusu Ansah" },
];

const EXPENSE_BY_CATEGORY = [
  { name: "Salaries", value: 4200, color: "#145A32" },
  { name: "Rent", value: 3500, color: "#2E7D32" },
  { name: "Utilities", value: 480, color: "#4C9A4F" },
  { name: "Transport", value: 220, color: "#7FB77E" },
  { name: "Maintenance", value: 350, color: "#A9CBA6" },
  { name: "Internet", value: 180, color: "#C9DFC7" },
  { name: "Marketing", value: 150, color: "#E1EEE0" },
];

const EMPLOYEES = [
  { id: "E-001", name: "Ama Owusu", role: "Cashier", branch: "Main Branch", status: "On Shift", sales: 12480, shiftStart: "08:00", expectedCash: 4820, actualCash: 4795, variance: -25 },
  { id: "E-002", name: "Kojo Mensah", role: "Cashier", branch: "Main Branch", status: "On Shift", sales: 9860, shiftStart: "08:00", expectedCash: 3120, actualCash: 3120, variance: 0 },
  { id: "E-003", name: "Owusu Ansah", role: "Manager", branch: "Main Branch", status: "Active", sales: null, shiftStart: null, expectedCash: null, actualCash: null, variance: null },
  { id: "E-004", name: "Efua Danso", role: "Cashier", branch: "Tema Branch", status: "Off Shift", sales: 7220, shiftStart: null, expectedCash: null, actualCash: null, variance: null },
];

const currency = (n) =>
  `GHS ${Math.abs(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InsightExpensesEmployees() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active] = useState("expenses");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const [tab, setTab] = useState("expenses"); // expenses | employees
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "employees") setTab("employees");
  }, []);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [session, setSession] = useState(null);
  const [liveExpenses, setLiveExpenses] = useState(null);
  const [liveGrossProfit, setLiveGrossProfit] = useState(null);
  const [liveEmployees, setLiveEmployees] = useState(null);

  const [showAddEmployeeForm, setShowAddEmployeeForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: "", email: "", password: "", role: "CASHIER" });
  const [employeeError, setEmployeeError] = useState("");
  const [employeeSubmitting, setEmployeeSubmitting] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: "RENT", amount: "", description: "", paymentMethod: "CASH" });
  const [addError, setAddError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  const CATEGORY_LABEL = {
    RENT: "Rent",
    UTILITIES: "Utilities",
    TRANSPORT: "Transport",
    SALARIES: "Salaries",
    MAINTENANCE: "Maintenance",
    MARKETING: "Marketing",
    INTERNET: "Internet",
    OTHER: "Other",
  };
  const METHOD_LABEL = {
    CASH: "Cash",
    MOBILE_MONEY: "Mobile Money",
    BANK_TRANSFER: "Bank Transfer",
    CARD: "Card",
    CREDIT: "Credit",
    OTHER: "Other",
  };
  const CATEGORY_COLORS = ["#145A32", "#2E7D32", "#4C9A4F", "#7FB77E", "#A9CBA6", "#C9DFC7", "#E1EEE0", "#8FA89A"];

  const loadExpenses = React.useCallback(async () => {
    try {
      const [expRes, profitRes] = await Promise.all([fetch("/api/expenses"), fetch("/api/reports/profit")]);
      if (expRes.ok) {
        const body = await expRes.json();
        setLiveExpenses(
          body.expenses.map((e) => ({
            id: e.id.slice(0, 8),
            date: new Date(e.incurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            category: CATEGORY_LABEL[e.category] ?? e.category,
            description: e.description ?? "—",
            amount: Number(e.amount),
            method: METHOD_LABEL[e.paymentMethod] ?? e.paymentMethod,
            user: e.createdBy?.name ?? "—",
          }))
        );
      }
      if (profitRes.ok) {
        const body = await profitRes.json();
        setLiveGrossProfit(body.grossProfit);
      }
    } catch {
      // Falls back to the static sample data below.
    }
  }, []);

  React.useEffect(() => {
    loadExpenses();
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body && setSession(body.user))
      .catch(() => {});
  }, [loadExpenses]);

  const ROLE_LABEL = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier" };

  const loadEmployees = React.useCallback(async () => {
    try {
      const res = await fetch("/api/employees");
      if (!res.ok) return;
      const body = await res.json();
      setLiveEmployees(
        body.employees.map((e) => {
          const activeShift = e.shifts?.[0];
          const status = activeShift ? "On Shift" : e.role === "CASHIER" ? "Off Shift" : "Active";
          return {
            id: e.id.slice(0, 8),
            name: e.name,
            role: ROLE_LABEL[e.role] ?? e.role,
            branch: e.branch?.name ?? "—",
            status,
            sales: null,
            expectedCash: null,
            actualCash: null,
            variance: null,
          };
        })
      );
    } catch {
      // Falls back to the static sample roster below.
    }
  }, []);

  React.useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const employeesToShow = liveEmployees ?? EMPLOYEES;

  async function handleAddEmployee(e) {
    e.preventDefault();
    setEmployeeError("");

    if (!newEmployee.name || !newEmployee.email || newEmployee.password.length < 8) {
      setEmployeeError("Name, email, and a password of at least 8 characters are required.");
      return;
    }

    setEmployeeSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEmployee),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setEmployeeError(body?.error ?? "Could not add this employee.");
        setEmployeeSubmitting(false);
        return;
      }

      setShowAddEmployeeForm(false);
      setNewEmployee({ name: "", email: "", password: "", role: "CASHIER" });
      await loadEmployees();
    } catch {
      setEmployeeError("Couldn't reach the server. The employee was not added.");
    } finally {
      setEmployeeSubmitting(false);
    }
  }

  const expensesToShow = liveExpenses ?? EXPENSES;

  const expenseByCategory = useMemo(() => {
    if (!liveExpenses) return EXPENSE_BY_CATEGORY;
    const totals = {};
    for (const e of liveExpenses) {
      totals[e.category] = (totals[e.category] ?? 0) + e.amount;
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [liveExpenses]);

  async function handleAddExpense(e) {
    e.preventDefault();
    setAddError("");

    if (!newExpense.amount || Number(newExpense.amount) <= 0) {
      setAddError("Enter a valid amount.");
      return;
    }

    setAddSubmitting(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newExpense.category,
          amount: Number(newExpense.amount),
          description: newExpense.description || undefined,
          paymentMethod: newExpense.paymentMethod,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAddError(body?.error ?? "Could not add this expense.");
        setAddSubmitting(false);
        return;
      }

      setShowAddForm(false);
      setNewExpense({ category: "RENT", amount: "", description: "", paymentMethod: "CASH" });
      await loadExpenses();
    } catch {
      setAddError("Couldn't reach the server. The expense was not added.");
    } finally {
      setAddSubmitting(false);
    }
  }

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
  const bad = "#B3261E";
  const warn = "#B7791F";

  const categories = ["All", ...Object.keys(CATEGORY_ICONS)];

  const filteredExpenses = useMemo(() => {
    return expensesToShow.filter((e) => {
      const matchesQuery = !query || e.description.toLowerCase().includes(query.toLowerCase()) || e.id.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = categoryFilter === "All" || e.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [query, categoryFilter, expensesToShow]);

  const totalExpenses = expensesToShow.reduce((s, e) => s + e.amount, 0);
  const grossProfit = liveGrossProfit ?? 12470; // illustrative fallback, matches dashboard-scale figures
  const netProfit = grossProfit - totalExpenses;

  const statusStyle = (status) => {
    if (status === "On Shift") return { color: primary, bg: dark ? "#173C26" : "#E7F5EA" };
    if (status === "Active") return { color: deep, bg: dark ? "#1B2B25" : "#EAF2EE" };
    return { color: theme.textMuted, bg: dark ? "#1B2B25" : "#F3F5F4" };
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "600px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {!collapsed && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Insight</div>
              <div style={{ fontSize: 10.5, color: "rgba(221,237,226,0.6)", marginTop: 1 }}>by 9DEVs</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle navigation"
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 4, display: "flex" }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {visibleNav(NAV_ITEMS, appMode).map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                title={collapsed ? item.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: collapsed ? "10px 0" : "10px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  marginBottom: 2,
                  cursor: "pointer",
                  borderRadius: 6,
                  background: isActive ? theme.sidebarActive : "transparent",
                  color: isActive ? "#FFFFFF" : theme.sidebarText,
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <Icon size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
            <div style={{ fontSize: 17, fontWeight: 700 }}>Expenses & Employees</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>{session?.business?.name ?? "Your business"} · {session?.branch?.name ?? "Main Branch"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle theme"
              style={{ background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              aria-label="Notifications"
              style={{ position: "relative", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}
            >
              <Bell size={16} />
              <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: bad }} />
            </button>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: deep, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>
              OA
            </div>
          </div>
        </header>

        <main style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
            {[
              { label: "Total Expenses (This Period)", value: currency(totalExpenses), color: bad },
              { label: "Gross Profit", value: currency(grossProfit), color: primary },
              { label: "Net Profit", value: currency(netProfit), color: netProfit >= 0 ? primary : bad },
            ].map((tile) => (
              <div key={tile.label} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12.5, color: theme.textMuted }}>{tile.label}</div>
                <div style={{ fontSize: 21, fontWeight: 700, marginTop: 8, color: tile.color }}>{tile.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${theme.border}` }}>
            {[
              { key: "expenses", label: "Expenses" },
              { key: "employees", label: "Employees & Shifts" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "9px 14px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: tab === t.key ? primary : theme.textMuted,
                  borderBottom: tab === t.key ? `2px solid ${primary}` : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "expenses" && (
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ flex: 1.6, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14, alignItems: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      padding: "7px 10px",
                      flex: "1 1 200px",
                      background: dark ? theme.surfaceAlt : "#FAFCFA",
                    }}
                  >
                    <Search size={15} color={theme.textMuted} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search expenses…"
                      style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: theme.text, width: "100%" }}
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "7px 10px", fontSize: 13, background: theme.surface, color: theme.text }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowAddForm(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: primary,
                      color: "#fff",
                      cursor: "pointer",
                      marginLeft: "auto",
                    }}
                  >
                    <Plus size={15} />
                    Add Expense
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                        {["Date", "Category", "Description", "Method", "Recorded By", "Amount"].map((h) => (
                          <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.map((e) => {
                        const Icon = CATEGORY_ICONS[e.category] ?? MoreHorizontal;
                        return (
                          <tr key={e.id}>
                            <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{e.date}</td>
                            <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Icon size={13} color={theme.textMuted} /> {e.category}
                              </span>
                            </td>
                            <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{e.description}</td>
                            <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{e.method}</td>
                            <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{e.user}</td>
                            <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 700, color: bad }}>
                              -{currency(e.amount)}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredExpenses.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: "32px 10px", textAlign: "center", color: theme.textMuted }}>
                            {expensesToShow.length === 0
                              ? "No expenses recorded yet."
                              : "No expenses match this search or filter."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ width: 300, flexShrink: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>By Category</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                      {expenseByCategory.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 12, borderRadius: 6 }}
                      formatter={(v) => currency(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {expenseByCategory.map((c) => (
                    <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, display: "inline-block" }} />
                        {c.name}
                      </div>
                      <span style={{ color: theme.textMuted }}>{currency(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "employees" && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Employees</div>
                <button
                  onClick={() => setShowAddEmployeeForm(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    background: primary,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={15} />
                  Add Employee
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                      {["Employee", "Role", "Branch", "Status", "Sales (Shift)", "Expected Cash", "Actual Cash", "Variance"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employeesToShow.map((e) => {
                      const s = statusStyle(e.status);
                      const hasVariance = e.variance !== null;
                      const varianceOk = e.variance === 0;
                      return (
                        <tr key={e.id}>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{e.name}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{e.role}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{e.branch}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: s.color, background: s.bg }}>
                              {e.status}
                            </span>
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{e.sales !== null ? currency(e.sales) : "—"}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>
                            {e.expectedCash !== null ? currency(e.expectedCash) : "—"}
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                            {e.actualCash !== null ? currency(e.actualCash) : "—"}
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                            {hasVariance ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontWeight: 700,
                                  color: varianceOk ? primary : bad,
                                }}
                              >
                                {varianceOk ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                                {varianceOk ? "Balanced" : `-${currency(Math.abs(e.variance))}`}
                              </span>
                            ) : (
                              <span style={{ color: theme.textMuted }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {employeesToShow.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: "32px 10px", textAlign: "center", color: theme.textMuted }}>
                          No employees yet. Invite your first teammate to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Expense slide-over */}
      {showAddForm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 360,
            background: theme.surface,
            borderLeft: `1px solid ${theme.border}`,
            padding: 22,
            boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add Expense</div>
            <button
              onClick={() => setShowAddForm(false)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleAddExpense}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Category</label>
              <select
                value={newExpense.category}
                onChange={(e) => setNewExpense((x) => ({ ...x, category: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              >
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Amount</label>
              <input
                type="number"
                value={newExpense.amount}
                onChange={(e) => setNewExpense((x) => ({ ...x, amount: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Description</label>
              <input
                value={newExpense.description}
                onChange={(e) => setNewExpense((x) => ({ ...x, description: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Payment Method</label>
              <select
                value={newExpense.paymentMethod}
                onChange={(e) => setNewExpense((x) => ({ ...x, paymentMethod: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              >
                {Object.entries(METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {addError && (
              <div style={{ marginBottom: 14, padding: "8px 11px", borderRadius: 6, background: dark ? "#3B1616" : "#FBE9E7", color: bad, fontSize: 12 }}>
                {addError}
              </div>
            )}

            <button
              type="submit"
              disabled={addSubmitting}
              style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: primary, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: addSubmitting ? "not-allowed" : "pointer", opacity: addSubmitting ? 0.75 : 1 }}
            >
              {addSubmitting ? "Adding…" : "Add Expense"}
            </button>
          </form>
        </div>
      )}

      {/* Add Employee slide-over */}
      {showAddEmployeeForm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 360,
            background: theme.surface,
            borderLeft: `1px solid ${theme.border}`,
            padding: 22,
            boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add Employee</div>
            <button
              onClick={() => setShowAddEmployeeForm(false)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleAddEmployee}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Name</label>
              <input
                value={newEmployee.name}
                onChange={(e) => setNewEmployee((x) => ({ ...x, name: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Email</label>
              <input
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee((x) => ({ ...x, email: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Temporary Password</label>
              <input
                type="text"
                value={newEmployee.password}
                onChange={(e) => setNewEmployee((x) => ({ ...x, password: e.target.value }))}
                placeholder="At least 8 characters"
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Role</label>
              <select
                value={newEmployee.role}
                onChange={(e) => setNewEmployee((x) => ({ ...x, role: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              >
                <option value="CASHIER">Cashier</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>

            {employeeError && (
              <div style={{ marginBottom: 14, padding: "8px 11px", borderRadius: 6, background: dark ? "#3B1616" : "#FBE9E7", color: bad, fontSize: 12 }}>
                {employeeError}
              </div>
            )}

            <button
              type="submit"
              disabled={employeeSubmitting}
              style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: primary, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: employeeSubmitting ? "not-allowed" : "pointer", opacity: employeeSubmitting ? 0.75 : 1 }}
            >
              {employeeSubmitting ? "Adding…" : "Add Employee"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
