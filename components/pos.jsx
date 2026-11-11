"use client";

import NotificationBell from "./notification-bell";

import { useAppNav, useAppMode, visibleNav } from "../lib/nav";
import { LogOut as LogOutIcon, History as HistoryIcon } from "lucide-react";

import React, { useState, useMemo } from "react";
import { buildReceiptFromSale, printReceipt, shareReceipt } from "../lib/receipt";
import { useOfflineSync, formatSyncStatus } from "../lib/offline/use-offline-sync";
import { generateClientTxnId } from "../lib/offline/db";
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
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  User,
  Banknote,
  Smartphone,
  Landmark,
  CreditCard,
  Wallet,
  MoreHorizontal,
  CheckCircle2,
  X,
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

const CATEGORIES = ["All", "Beverages", "Snacks", "Household", "Personal Care", "Dairy"];


const CUSTOMERS = ["Walk-in", "Linda Boateng", "Kwabena Asante", "Nana Adjei", "Efua Sarpong"];

const PAYMENT_METHODS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "momo", label: "Mobile Money", icon: Smartphone },
  { key: "transfer", label: "Bank Transfer", icon: Landmark },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "credit", label: "Credit", icon: Wallet },
];

const currency = (n) =>
  `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Last-known catalog, customers and session, so the POS can open and sell
// without a connection. Stock figures from the cache are indicative only;
// the server re-checks stock when queued sales sync.
const POS_CACHE_KEY = "insight_pos_cache_v1";
function readPosCache() {
  try {
    return JSON.parse(localStorage.getItem(POS_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}
function writePosCache(patch) {
  try {
    const current = readPosCache() || {};
    localStorage.setItem(POS_CACHE_KEY, JSON.stringify({ ...current, ...patch, savedAt: new Date().toISOString() }));
  } catch {
    // Storage full or blocked: the POS still works online.
  }
}

export default function InsightPOS() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [active] = useState("pos");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState(""); // "" = Walk-in
  const [discountPct, setDiscountPct] = useState(0);
  const [payment, setPayment] = useState("cash");
  const [completed, setCompleted] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [receiptNote, setReceiptNote] = useState("");

  // Live data from the API (or the device cache when offline). Until it loads, the
  // arrays above are shown so the screen is never blank.
  const [session, setSession] = useState(null);
  const [liveProducts, setLiveProducts] = useState(null);
  const [liveCustomers, setLiveCustomers] = useState(null);
  const [saleError, setSaleError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const offline = useOfflineSync();
  const [usingCache, setUsingCache] = useState(false);

  const loadCatalog = React.useCallback(async (branchId) => {
    const res = await fetch("/api/products?pageSize=100");
    if (!res.ok) throw new Error("catalog");
    const body = await res.json();
    const items = body.items.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? "Uncategorized",
      price: Number(p.sellingPrice),
      qty: p.inventoryLevels?.find((l) => l.branchId === branchId)?.quantity ?? 0,
      unit: p.unit,
    }));
    setLiveProducts(items);
    writePosCache({ products: items });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) throw new Error("session");
        const meBody = await meRes.json();
        if (cancelled) return;
        setSession(meBody.user);
        writePosCache({ session: meBody.user });

        const [, custRes] = await Promise.all([
          loadCatalog(meBody.user.branchId),
          fetch("/api/customers"),
        ]);
        if (!cancelled && custRes.ok) {
          const custBody = await custRes.json();
          setLiveCustomers(custBody.customers);
          writePosCache({ customers: custBody.customers });
        }
        if (!cancelled) setUsingCache(false);
      } catch {
        // Offline or server unreachable: fall back to the last-known data.
        if (cancelled) return;
        const cached = readPosCache();
        if (cached?.session) setSession((s) => s ?? cached.session);
        setLiveProducts((p) => p ?? cached?.products ?? []);
        setLiveCustomers((c) => c ?? cached?.customers ?? []);
        setUsingCache(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [loadCatalog]);

  const activeProducts = liveProducts ?? [];
  const activeCustomers = liveCustomers ?? null; // null triggers the static name list in the dropdown

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

  const categoryOptions = useMemo(
    () => ["All", ...Array.from(new Set(activeProducts.map((p) => p.category)))],
    [activeProducts]
  );

  const filteredProducts = useMemo(() => {
    return activeProducts.filter((p) => {
      const matchesQuery = !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = category === "All" || p.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [query, category, activeProducts]);

  const addToCart = (product) => {
    if (product.qty === 0) return;
    setCart((c) => {
      const existing = c.find((i) => i.id === product.id);
      if (existing) {
        if (existing.qty >= product.qty) return c;
        return c.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...c, { ...product, cartQty: 1, qty: 1, stock: product.qty }];
    });
  };

  const changeQty = (id, delta) => {
    setCart((c) =>
      c
        .map((i) => (i.id === id ? { ...i, qty: Math.max(0, Math.min(i.stock, i.qty + delta)) } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeItem = (id) => setCart((c) => c.filter((i) => i.id !== id));

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discount = subtotal * (discountPct / 100);
  const total = subtotal - discount;

  const PAYMENT_ENUM = {
    cash: "CASH",
    momo: "MOBILE_MONEY",
    transfer: "BANK_TRANSFER",
    card: "CARD",
    credit: "CREDIT",
  };

  const customerName = customerId
    ? activeCustomers?.find((c) => c.id === customerId)?.name ?? "Customer"
    : "Walk-in";

  const completeSale = async () => {
    if (cart.length === 0) return;
    setSaleError("");

    if (payment === "credit" && !customerId) {
      setSaleError("Select a customer before completing a credit sale.");
      return;
    }
    if (!session?.branchId) {
      setSaleError("Could not determine your branch. Try refreshing the page.");
      return;
    }

    const payload = {
      clientTxnId: generateClientTxnId(),
      branchId: session.branchId,
      customerId: customerId || undefined,
      paymentMethod: PAYMENT_ENUM[payment],
      items: cart.map((i) => ({ productId: i.id, quantity: i.qty })),
      discountPercent: discountPct,
      occurredAt: new Date().toISOString(),
    };
    const localReceipt = {
      id: null,
      items: cart,
      subtotal,
      discount,
      total,
      customer: customerName,
      payment,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Saves the sale to the device queue; the sync engine sends it (with the
    // same clientTxnId, so it can never be recorded twice) when online.
    const saveOffline = async () => {
      if (payment === "credit") {
        setSaleError("Credit sales need a connection so the customer's credit limit can be checked. Choose another payment method or try again when online.");
        return false;
      }
      await offline.queueSale(payload);
      setCompleted({ ...localReceipt, id: `Pending sync (${payload.clientTxnId.slice(0, 8)})`, offline: true });
      setReceiptData({
        business: { name: session.business?.name, currency: session.business?.currency },
        receiptNumber: `PENDING-${payload.clientTxnId.slice(0, 8).toUpperCase()}`,
        date: payload.occurredAt,
        branch: session.branch?.name ?? "",
        cashier: session.name ?? "",
        customer: customerName,
        items: cart.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.price })),
        subtotal,
        discount,
        total,
        paymentMethod: payload.paymentMethod,
        status: "COMPLETED",
      });
      // Reflect the sale in the locally shown stock until the next refresh.
      setLiveProducts((list) => {
        const next = (list ?? []).map((p) => {
          const line = cart.find((c) => c.id === p.id);
          return line ? { ...p, qty: Math.max(0, p.qty - line.qty) } : p;
        });
        writePosCache({ products: next });
        return next;
      });
      return true;
    };

    setSubmitting(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (await saveOffline()) {
          setCart([]);
          setDiscountPct(0);
          setCustomerId("");
        }
        return;
      }

      let res;
      try {
        res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // The request never reached the server: keep the sale on this device.
        if (await saveOffline()) {
          setCart([]);
          setDiscountPct(0);
          setCustomerId("");
        }
        return;
      }
      if (res.status >= 500) {
        // Server-side failure: the idempotent clientTxnId makes it safe to
        // queue and retry; if the first attempt did land, the retry is a no-op.
        if (await saveOffline()) {
          setCart([]);
          setDiscountPct(0);
          setCustomerId("");
        }
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaleError(body?.error ?? "Sale could not be completed.");
        return;
      }

      setCompleted({ ...localReceipt, id: body.sale?.receiptNumber ?? "Recorded" });
      // Load the full server-side sale (cashier, branch, business details)
      // so the printed/shared receipt matches the record exactly.
      if (body.sale?.id) {
        fetch(`/api/sales/${body.sale.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.sale) setReceiptData(buildReceiptFromSale(d));
          })
          .catch(() => null);
      }
      setCart([]);
      setDiscountPct(0);
      setCustomerId("");
      // Stock just changed server-side — refresh so the grid reflects it.
      loadCatalog(session.branchId).catch(() => null);
    } catch {
      setSaleError("The sale could not be saved on this device. Nothing was recorded; please try again.");
    } finally {
      setSubmitting(false);
    }
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
      {/* Sidebar (collapsed by default on POS — screen space matters) */}
      <aside
        style={{
          width: collapsed ? 60 : 220,
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
            padding: "16px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {!collapsed && <div style={{ fontSize: 15, fontWeight: 700 }}>Insight</div>}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle navigation"
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 4, display: "flex" }}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
        <nav style={{ flex: 1, padding: "10px 6px", overflowY: "auto" }}>
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
                  gap: 10,
                  padding: collapsed ? "9px 0" : "9px 10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  marginBottom: 2,
                  cursor: "pointer",
                  borderRadius: 6,
                  background: isActive ? theme.sidebarActive : "transparent",
                  color: isActive ? "#FFFFFF" : theme.sidebarText,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <Icon size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
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

      {/* Main POS area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.surface,
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Point of Sale</div>
            <div
              role="status"
              aria-live="polite"
              title={usingCache ? "Showing the last saved catalog" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
                color: offline.failed > 0 ? "#B3261E" : offline.phase === "offline" ? "#B7791F" : "#2E7D32",
                background: offline.failed > 0 ? (dark ? "#3A1D1B" : "#FBE9E7") : offline.phase === "offline" ? (dark ? "#33291A" : "#FFF4E0") : (dark ? "#173C26" : "#E7F5EA"),
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
              {formatSyncStatus(offline)}
              {offline.pending > 0 && offline.phase !== "offline" && offline.phase !== "syncing" ? ` · ${offline.pending} pending` : ""}
            </div>
            {offline.failed > 0 && (
              <button onClick={() => offline.retryFailed()} style={{ fontSize: 11.5, fontWeight: 600, border: "1px solid #B3261E", color: "#B3261E", background: "transparent", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
                Retry
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 460 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: "8px 10px",
                width: "100%",
                background: dark ? theme.surfaceAlt : "#FAFCFA",
              }}
            >
              <ScanBarcode size={16} color={theme.textMuted} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan barcode or search products…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: theme.text, width: "100%" }}
              />
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
            <div style={{ width: 30, height: 30, borderRadius: 6, background: deep, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
              AO
            </div>
          </div>
        </header>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Product grid */}
          <div style={{ flex: 1.5, display: "flex", flexDirection: "column", padding: "16px 18px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {categoryOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px solid ${category === c ? primary : theme.border}`,
                    background: category === c ? primary : "transparent",
                    color: category === c ? "#fff" : theme.text,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 10,
                overflowY: "auto",
                paddingRight: 4,
                flex: 1,
              }}
            >
              {filteredProducts.map((p) => {
                const outOfStock = p.qty === 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={outOfStock}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                      background: theme.surface,
                      padding: 12,
                      cursor: outOfStock ? "not-allowed" : "pointer",
                      opacity: outOfStock ? 0.5 : 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      minHeight: 92,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
                        {outOfStock ? "Out of stock" : `${p.qty} ${p.unit} left`}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: primary, marginTop: 8 }}>{currency(p.price)}</div>
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: theme.textMuted }}>
                  No products match this search.
                </div>
              )}
            </div>
          </div>

          {/* Cart / checkout panel */}
          <div
            style={{
              width: 340,
              flexShrink: 0,
              borderLeft: `1px solid ${theme.border}`,
              background: theme.surface,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Current Sale</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  padding: "7px 10px",
                }}
              >
                <User size={14} color={theme.textMuted} />
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: theme.text, width: "100%" }}
                >
                  <option value="">Walk-in</option>
                  {(activeCustomers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: "center", color: theme.textMuted, fontSize: 13, padding: "40px 10px" }}>
                  Cart is empty. Select products to begin a sale.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 4px",
                      borderBottom: `1px solid ${theme.border}`,
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: theme.textMuted }}>{currency(item.price)} each</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => changeQty(item.id, -1)}
                        style={{ border: `1px solid ${theme.border}`, background: "transparent", borderRadius: 4, cursor: "pointer", padding: 3, display: "flex", color: theme.text }}
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ fontSize: 12.5, width: 18, textAlign: "center" }}>{item.qty}</span>
                      <button
                        onClick={() => changeQty(item.id, 1)}
                        style={{ border: `1px solid ${theme.border}`, background: "transparent", borderRadius: 4, cursor: "pointer", padding: 3, display: "flex", color: theme.text }}
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 3, display: "flex", color: bad }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: "14px 18px", borderTop: `1px solid ${theme.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, color: theme.textMuted }}>Discount</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                  style={{ width: 52, border: `1px solid ${theme.border}`, borderRadius: 5, padding: "4px 6px", fontSize: 12.5, background: theme.surface, color: theme.text }}
                />
                <span style={{ fontSize: 12.5, color: theme.textMuted }}>%</span>
              </div>

              <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4, color: theme.textMuted }}>
                <span>Subtotal</span>
                <span>{currency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4, color: warn }}>
                  <span>Discount</span>
                  <span>-{currency(discount)}</span>
                </div>
              )}
              <div style={{ fontSize: 17, fontWeight: 700, display: "flex", justifyContent: "space-between", marginTop: 8, marginBottom: 14 }}>
                <span>Total</span>
                <span>{currency(total)}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon;
                  const isActive = payment === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setPayment(m.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 8px",
                        borderRadius: 6,
                        border: `1px solid ${isActive ? primary : theme.border}`,
                        background: isActive ? (dark ? "#173C26" : "#E7F5EA") : "transparent",
                        color: isActive ? primary : theme.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Icon size={13} />
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {saleError && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "8px 11px",
                    borderRadius: 6,
                    background: dark ? "#3B1616" : "#FBE9E7",
                    color: bad,
                    fontSize: 12,
                  }}
                >
                  {saleError}
                </div>
              )}

              <button
                onClick={completeSale}
                disabled={cart.length === 0 || submitting}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  borderRadius: 7,
                  border: "none",
                  background: cart.length === 0 || submitting ? theme.border : primary,
                  color: cart.length === 0 || submitting ? theme.textMuted : "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: cart.length === 0 || submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Completing Sale…" : `Complete Sale · ${currency(total)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Receipt / confirmation modal */}
      {completed && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div style={{ background: theme.surface, borderRadius: 10, width: 320, padding: 22, border: `1px solid ${theme.border}` }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 14 }}>
              <CheckCircle2 size={36} color={primary} />
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{completed.offline ? "Sale Saved Offline" : "Sale Completed"}</div>
              {completed.offline && (
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                  Stored on this device and will sync automatically when the connection returns.
                </div>
              )}
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                {completed.id} · {completed.time}
              </div>
            </div>

            <div style={{ borderTop: `1px dashed ${theme.border}`, borderBottom: `1px dashed ${theme.border}`, padding: "10px 0", marginBottom: 12 }}>
              {completed.items.map((i) => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                  <span>
                    {i.qty} × {i.name}
                  </span>
                  <span>{currency(i.price * i.qty)}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 3, color: theme.textMuted }}>
              <span>Customer</span>
              <span>{completed.customer}</span>
            </div>
            <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 3, color: theme.textMuted }}>
              <span>Payment</span>
              <span>{PAYMENT_METHODS.find((m) => m.key === completed.payment)?.label}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, display: "flex", justifyContent: "space-between", marginTop: 8, marginBottom: 16 }}>
              <span>Total Paid</span>
              <span>{currency(completed.total)}</span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setCompleted(null); setReceiptData(null); setReceiptNote(""); }}
                style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                New Sale
              </button>
              <button
                disabled={!receiptData}
                onClick={() => {
                  if (!printReceipt(receiptData)) setReceiptNote("Allow pop-ups for this site to print.");
                }}
                style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "none", background: primary, color: "#fff", fontWeight: 600, fontSize: 13, cursor: receiptData ? "pointer" : "default", opacity: receiptData ? 1 : 0.6 }}
              >
                Print Receipt
              </button>
              <button
                disabled={!receiptData}
                onClick={() => shareReceipt(receiptData)}
                style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, fontWeight: 600, fontSize: 13, cursor: receiptData ? "pointer" : "default", opacity: receiptData ? 1 : 0.6 }}
              >
                Share
              </button>
            </div>
            {receiptNote && (
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8, textAlign: "center" }}>{receiptNote}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
