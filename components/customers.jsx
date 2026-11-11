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
  Plus,
  X,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  Clock,
} from "lucide-react";

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

const CUSTOMERS = [
  {
    id: "C-0001",
    name: "Linda Boateng",
    phone: "024 555 0142",
    email: "linda.boateng@example.com",
    address: "12 Ring Road, Accra",
    creditLimit: 1000,
    creditBalance: 612.0,
    lastPurchase: "Today, 09:22",
    history: [
      { date: "Today, 09:22", type: "Credit Sale", ref: "RCT-10481", amount: 612.0, dueDate: "14 Sep 2026" },
      { date: "28 Aug", type: "Payment", ref: "PAY-0091", amount: -400.0 },
      { date: "12 Aug", type: "Credit Sale", ref: "RCT-10312", amount: 400.0, dueDate: "26 Aug 2026" },
    ],
  },
  {
    id: "C-0002",
    name: "Kwabena Asante",
    phone: "020 333 7781",
    email: "k.asante@example.com",
    address: "Spintex Road, Accra",
    creditLimit: 500,
    creditBalance: 0,
    lastPurchase: "Today, 08:40",
    history: [
      { date: "Today, 08:40", type: "Sale (Card)", ref: "RCT-10479", amount: 298.25 },
      { date: "15 Aug", type: "Payment", ref: "PAY-0084", amount: -180.0 },
      { date: "2 Aug", type: "Credit Sale", ref: "RCT-10201", amount: 180.0, dueDate: "16 Aug 2026" },
    ],
  },
  {
    id: "C-0003",
    name: "Nana Adjei",
    phone: "055 214 9902",
    email: "nana.adjei@example.com",
    address: "Tema Community 5",
    creditLimit: 800,
    creditBalance: 745.5,
    lastPurchase: "3 Sep",
    history: [
      { date: "3 Sep", type: "Credit Sale", ref: "RCT-10390", amount: 745.5, dueDate: "5 Sep 2026" },
    ],
  },
  {
    id: "C-0004",
    name: "Efua Sarpong",
    phone: "027 660 1123",
    email: "efua.s@example.com",
    address: "East Legon, Accra",
    creditLimit: 300,
    creditBalance: 60.0,
    lastPurchase: "30 Aug",
    history: [
      { date: "30 Aug", type: "Credit Sale", ref: "RCT-10288", amount: 60.0, dueDate: "13 Sep 2026" },
    ],
  },
  {
    id: "C-0005",
    name: "Kojo Antwi",
    phone: "050 887 4420",
    email: "kojo.antwi@example.com",
    address: "Kasoa Highway",
    creditLimit: 200,
    creditBalance: 0,
    lastPurchase: "18 Aug",
    history: [{ date: "18 Aug", type: "Sale (Cash)", ref: "RCT-10190", amount: 84.0 }],
  },
];

const currency = (n) =>
  `GHS ${Math.abs(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

// The mock data already uses friendly strings ("Today, 09:22", "14 Sep
// 2026"); live data carries real ISO timestamps. This renders either
// correctly without needing two different history shapes upstream.
function formatHistoryDate(value) {
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value; // already a display string
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function InsightCustomers() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active] = useState("customers");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | credit | overdue
  const [selectedId, setSelectedId] = useState(CUSTOMERS[0].id);
  const [paymentAmount, setPaymentAmount] = useState("");

  const [session, setSession] = useState(null);
  const [liveCustomers, setLiveCustomers] = useState(null);
  const [statementsById, setStatementsById] = useState({});
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "", address: "", creditLimit: "" });
  const [addError, setAddError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  const loadCustomers = React.useCallback(async () => {
    try {
      const res = await fetch("/api/customers");
      if (!res.ok) return;
      const body = await res.json();
      setLiveCustomers(body.customers);

      // Small customer lists (typical for a single business) make it
      // reasonable to fetch every statement up front, so the list can show
      // overdue status immediately rather than only after a click.
      const entries = await Promise.all(
        body.customers.map(async (c) => {
          const stRes = await fetch(`/api/customers/${c.id}/statement`);
          if (!stRes.ok) return [c.id, null];
          const stBody = await stRes.json();
          return [c.id, stBody];
        })
      );
      setStatementsById(Object.fromEntries(entries));
    } catch {
      // Falls back to the static sample list below.
    }
  }, []);

  React.useEffect(() => {
    loadCustomers();
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body && setSession(body.user))
      .catch(() => {});
  }, [loadCustomers]);

  // Normalizes each live customer into the same shape the static sample
  // data uses (a flat, date-sorted "history" array of credit sales,
  // payments, and cash/card sales) so the rest of this screen — built
  // against the sample shape — doesn't need to change.
  const customersToShow = useMemo(() => {
    if (!liveCustomers) return CUSTOMERS; // not yet loaded — show sample while waiting
    if (liveCustomers.length === 0) return []; // genuinely no customers yet — show real empty state

    return liveCustomers.map((c) => {
      const statement = statementsById[c.id];
      const history = [];

      if (statement) {
        for (const ca of statement.creditAccounts) {
          history.push({
            date: ca.createdAt,
            type: "Credit Sale",
            ref: ca.sale?.receiptNumber ?? "—",
            amount: Number(ca.originalAmount),
            dueDate: ca.dueDate,
          });
          for (const payment of ca.payments) {
            history.push({
              date: payment.paidAt,
              type: "Payment",
              ref: `PAY-${payment.id.slice(0, 8)}`,
              amount: -Number(payment.amount),
            });
          }
        }
        const creditSaleIds = new Set(statement.creditAccounts.map((ca) => ca.saleId));
        for (const sale of statement.sales) {
          if (creditSaleIds.has(sale.id)) continue;
          history.push({
            date: sale.createdAt,
            type: `Sale (${sale.paymentMethod?.replace("_", " ")})`,
            ref: sale.receiptNumber,
            amount: Number(sale.totalAmount),
          });
        }
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone ?? "—",
        email: c.email ?? "—",
        address: c.address ?? "—",
        creditLimit: Number(c.creditLimit),
        creditBalance: Number(c.creditBalance),
        lastPurchase: history[0] ? new Date(history[0].date).toLocaleDateString() : "—",
        history,
      };
    });
  }, [liveCustomers, statementsById]);

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

  const overdueCustomerIds = useMemo(
    () =>
      new Set(
        customersToShow.filter((c) => c.history.some((h) => h.dueDate && isOverdue(h.dueDate) && c.creditBalance > 0)).map(
          (c) => c.id
        )
      ),
    [customersToShow]
  );

  const filtered = useMemo(() => {
    return customersToShow.filter((c) => {
      const matchesQuery = !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "credit" && c.creditBalance > 0) ||
        (filter === "overdue" && overdueCustomerIds.has(c.id));
      return matchesQuery && matchesFilter;
    });
  }, [query, filter, overdueCustomerIds, customersToShow]);

  const totals = useMemo(() => {
    const totalOutstanding = customersToShow.reduce((s, c) => s + c.creditBalance, 0);
    const withCredit = customersToShow.filter((c) => c.creditBalance > 0).length;
    const overdue = overdueCustomerIds.size;
    return { totalOutstanding, withCredit, overdue };
  }, [overdueCustomerIds, customersToShow]);

  const selected = customersToShow.find((c) => c.id === selectedId) ?? customersToShow[0] ?? null;
  const selectedOverdue = selected ? overdueCustomerIds.has(selected.id) : false;

  async function recordPayment() {
    setPaymentError("");
    const amount = Number(paymentAmount);

    if (!amount || amount <= 0) {
      setPaymentError("Enter a valid payment amount.");
      return;
    }
    if (!liveCustomers) {
      setPaymentError("Payments can't be recorded on sample data — try again once live data has loaded.");
      return;
    }

    setPaymentSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${selected.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method: "CASH" }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPaymentError(body?.error ?? "Could not record this payment.");
        setPaymentSubmitting(false);
        return;
      }

      setPaymentAmount("");
      await loadCustomers();
    } catch {
      setPaymentError("Couldn't reach the server. The payment was not recorded.");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function handleAddCustomer(e) {
    e.preventDefault();
    setAddError("");

    if (!newCustomer.name) {
      setAddError("Customer name is required.");
      return;
    }

    setAddSubmitting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustomer.name,
          phone: newCustomer.phone || undefined,
          email: newCustomer.email || undefined,
          address: newCustomer.address || undefined,
          creditLimit: Number(newCustomer.creditLimit) || 0,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAddError(body?.error ?? "Could not add this customer.");
        setAddSubmitting(false);
        return;
      }

      setShowAddForm(false);
      setNewCustomer({ name: "", phone: "", email: "", address: "", creditLimit: "" });
      await loadCustomers();
    } catch {
      setAddError("Couldn't reach the server. The customer was not added.");
    } finally {
      setAddSubmitting(false);
    }
  }

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
            <div style={{ fontSize: 17, fontWeight: 700 }}>Customers</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>
              {session?.business?.name ?? "Your business"} · {customersToShow.length} customers on file
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle theme"
              style={{ background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <NotificationBell theme={theme} dark={dark} />
            <div style={{ width: 32, height: 32, borderRadius: 6, background: deep, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>
              OA
            </div>
          </div>
        </header>

        <main style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
            {[
              { label: "Total Outstanding Credit", value: currency(totals.totalOutstanding), color: warn, icon: Wallet },
              { label: "Customers with Credit", value: totals.withCredit, color: theme.text, icon: Users },
              { label: "Overdue Accounts", value: totals.overdue, color: bad, icon: AlertTriangle },
            ].map((tile) => {
              const Icon = tile.icon;
              return (
                <div key={tile.label} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 12.5, color: theme.textMuted }}>{tile.label}</div>
                    <Icon size={16} color={theme.textMuted} />
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, marginTop: 8, color: tile.color }}>{tile.value}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
            {/* Customer list */}
            <div style={{ flex: 1, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
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
                    placeholder="Search name or phone…"
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: theme.text, width: "100%" }}
                  />
                </div>
                <div style={{ display: "flex", border: `1px solid ${theme.border}`, borderRadius: 6, overflow: "hidden" }}>
                  {[
                    { key: "all", label: "All" },
                    { key: "credit", label: "On Credit" },
                    { key: "overdue", label: "Overdue" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      style={{
                        padding: "7px 12px",
                        fontSize: 12.5,
                        border: "none",
                        cursor: "pointer",
                        background: filter === f.key ? primary : "transparent",
                        color: filter === f.key ? "#fff" : theme.text,
                        fontWeight: 600,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
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
                  Add Customer
                </button>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                {filtered.map((c) => {
                  const overdue = overdueCustomerIds.has(c.id);
                  const isSelected = c.id === selectedId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 10px",
                        border: "none",
                        borderBottom: `1px solid ${theme.border}`,
                        background: isSelected ? (dark ? "#1B2B25" : "#F5FBF6") : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>
                          {c.phone} · Last purchase {c.lastPurchase}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: c.creditBalance > 0 ? (overdue ? bad : warn) : primary }}>
                          {c.creditBalance > 0 ? currency(c.creditBalance) : "Settled"}
                        </div>
                        {overdue && (
                          <div style={{ fontSize: 10.5, color: bad, marginTop: 2, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                            <AlertTriangle size={10} /> Overdue
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div style={{ padding: 32, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
                    {customersToShow.length === 0
                      ? "No customers yet. Add your first customer to get started."
                      : "No customers match this search or filter."}
                  </div>
                )}
              </div>
            </div>

            {/* Customer statement panel */}
            {selected ? (
            <div style={{ width: 360, flexShrink: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>{selected.name}</div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>Customer {selected.id}</div>
                </div>
                {selectedOverdue && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 4,
                      color: bad,
                      background: dark ? "#3B1616" : "#FBE9E7",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <AlertTriangle size={11} /> Overdue
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: theme.textMuted, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Phone size={13} /> {selected.phone}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mail size={13} /> {selected.email}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MapPin size={13} /> {selected.address}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>Credit Limit</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{currency(selected.creditLimit)}</div>
                </div>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>Outstanding</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: selected.creditBalance > 0 ? warn : primary }}>
                    {currency(selected.creditBalance)}
                  </div>
                </div>
              </div>

              {selected.creditBalance > 0 && (
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Record Payment</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Amount"
                      style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 5, padding: "7px 9px", fontSize: 12.5, background: theme.surface, color: theme.text }}
                    />
                    <button
                      onClick={recordPayment}
                      disabled={paymentSubmitting}
                      style={{ padding: "7px 14px", borderRadius: 5, border: "none", background: primary, color: "#fff", fontWeight: 600, fontSize: 12.5, cursor: paymentSubmitting ? "not-allowed" : "pointer", opacity: paymentSubmitting ? 0.7 : 1 }}
                    >
                      {paymentSubmitting ? "Recording…" : "Record"}
                    </button>
                  </div>
                  {paymentError && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: bad }}>{paymentError}</div>
                  )}
                </div>
              )}

              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Statement</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selected.history.map((h, i) => {
                  const isPayment = h.type === "Payment";
                  const overdueLine = h.dueDate && isOverdue(h.dueDate) && selected.creditBalance > 0;
                  return (
                    <div key={i} style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "9px 11px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
                          {isPayment ? <CheckCircle2 size={13} color={primary} /> : <Clock size={13} color={theme.textMuted} />}
                          {h.type}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isPayment ? primary : theme.text }}>
                          {isPayment ? "-" : ""}
                          {currency(h.amount)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                        <span>{formatHistoryDate(h.date)} · {h.ref}</span>
                        {h.dueDate && (
                          <span style={{ color: overdueLine ? bad : theme.textMuted }}>Due {formatHistoryDate(h.dueDate)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            ) : (
              <div style={{ width: 360, flexShrink: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
                Add a customer to see their statement here.
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add Customer slide-over */}
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add Customer</div>
            <button
              onClick={() => setShowAddForm(false)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleAddCustomer}>
            {[
              { key: "name", label: "Name" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
              { key: "address", label: "Address" },
              { key: "creditLimit", label: "Credit Limit", type: "number" },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>{field.label}</label>
                <input
                  type={field.type ?? "text"}
                  value={newCustomer[field.key]}
                  onChange={(e) => setNewCustomer((c) => ({ ...c, [field.key]: e.target.value }))}
                  style={{
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    padding: "8px 11px",
                    fontSize: 13,
                    background: dark ? theme.surfaceAlt : "#FAFCFA",
                    color: theme.text,
                  }}
                />
              </div>
            ))}

            {addError && (
              <div style={{ marginBottom: 14, padding: "8px 11px", borderRadius: 6, background: dark ? "#3B1616" : "#FBE9E7", color: bad, fontSize: 12 }}>
                {addError}
              </div>
            )}

            <button
              type="submit"
              disabled={addSubmitting}
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 6,
                border: "none",
                background: primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: addSubmitting ? "not-allowed" : "pointer",
                opacity: addSubmitting ? 0.75 : 1,
              }}
            >
              {addSubmitting ? "Adding…" : "Add Customer"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
