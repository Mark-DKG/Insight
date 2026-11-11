"use client";

import NotificationBell from "./notification-bell";

import { useAppNav, useAppMode, visibleNav, hasPos } from "../lib/nav";
import ProductActions from "./product-actions";
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
  Filter,
  ArrowUpDown,
  X,
  ChevronDown,
  PackageCheck,
  PackageX,
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
} from "lucide-react";

/* Same token system as the Dashboard */
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

const CATEGORIES = ["All Categories", "Beverages", "Snacks", "Household", "Personal Care", "Dairy"];

const PRODUCTS = [
  { id: "P-0001", name: "Sunlight Cooking Oil 2L", sku: "SNL-OIL-2L", barcode: "6001087312456", category: "Household", cost: 24.0, price: 32.0, qty: 6, min: 15, max: 80, supplier: "Kama Distributors", unit: "Bottle" },
  { id: "P-0002", name: "Malta Guinness 330ml", sku: "MLT-GUI-330", barcode: "6001007512344", category: "Beverages", cost: 4.2, price: 6.5, qty: 142, min: 60, max: 300, supplier: "Accra Beverage Co.", unit: "Can" },
  { id: "P-0003", name: "Milo 400g Tin", sku: "MLO-400", barcode: "6009880912233", category: "Beverages", cost: 28.5, price: 38.0, qty: 0, min: 10, max: 50, supplier: "Kama Distributors", unit: "Tin" },
  { id: "P-0004", name: "Indomie Chicken 70g", sku: "INDM-CHK-70", barcode: "6151100022189", category: "Snacks", cost: 2.1, price: 3.5, qty: 480, min: 200, max: 1000, supplier: "West Africa Foods", unit: "Pack" },
  { id: "P-0005", name: "Fan Milk Yoghurt 500ml", sku: "FML-YOG-500", barcode: "6001234509981", category: "Dairy", cost: 9.0, price: 13.5, qty: 11, min: 20, max: 100, supplier: "Fan Milk Ltd.", unit: "Bottle" },
  { id: "P-0006", name: "Dettol Soap 100g", sku: "DTL-SOAP-100", barcode: "6001087732211", category: "Personal Care", cost: 5.6, price: 8.0, qty: 3, min: 25, max: 120, supplier: "Kama Distributors", unit: "Bar" },
  { id: "P-0007", name: "Peace Detergent Powder 1kg", sku: "PCE-DET-1KG", barcode: "6009991123044", category: "Household", cost: 14.0, price: 19.5, qty: 58, min: 20, max: 100, supplier: "West Africa Foods", unit: "Bag" },
  { id: "P-0008", name: "Coca-Cola 350ml", sku: "CCL-350", barcode: "6001007712398", category: "Beverages", cost: 3.4, price: 5.0, qty: 210, min: 100, max: 500, supplier: "Accra Beverage Co.", unit: "Bottle" },
];

const MOVEMENTS = [
  { time: "09:41", product: "Malta Guinness 330ml", type: "Stock Out", qty: -12, ref: "RCT-10482", user: "Ama Owusu" },
  { time: "08:15", product: "Sunlight Cooking Oil 2L", qty: -2, type: "Stock Out", ref: "RCT-10478", user: "Ama Owusu" },
  { time: "07:50", product: "Indomie Chicken 70g", type: "Stock In", qty: 240, ref: "PO-2214", user: "Kojo Mensah" },
  { time: "Yesterday", product: "Milo 400g Tin", type: "Adjustment", qty: -3, ref: "ADJ-0091", user: "System" },
  { time: "Yesterday", product: "Dettol Soap 100g", type: "Damaged", qty: -4, ref: "DMG-0033", user: "Kojo Mensah" },
];

const currency = (n) =>
  `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function stockState(p) {
  if (p.qty === 0) return "out";
  if (p.qty <= p.min) return "low";
  return "in";
}

export default function InsightInventory() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("inventory");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const [modeNotice, setModeNotice] = useState(false);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("notice") === "inventory-only") setModeNotice(true);
  }, []);
  const [tab, setTab] = useState("products"); // products | movements
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [statusFilter, setStatusFilter] = useState("all"); // all | low | out
  const [sortKey, setSortKey] = useState("name");
  const [selected, setSelected] = useState(null);

  const [session, setSession] = useState(null);
  const [liveProducts, setLiveProducts] = useState(null);
  const [loadError, setLoadError] = useState("");

  const loadProducts = React.useCallback(async (branchId) => {
    try {
      const res = await fetch("/api/products?pageSize=100");
      if (!res.ok) return;
      const body = await res.json();
      setLiveProducts(
        body.items.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode ?? "",
          category: p.category?.name ?? "Uncategorized",
          cost: Number(p.costPrice),
          price: Number(p.sellingPrice),
          qty: p.inventoryLevels?.find((l) => l.branchId === branchId)?.quantity ?? 0,
          min: p.minStockLevel,
          max: p.maxStockLevel,
          supplier: p.supplier?.name ?? "—",
          unit: p.unit,
        }))
      );
    } catch {
      setLoadError("Showing sample data — couldn't reach the server.");
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) return;
        const meBody = await meRes.json();
        if (cancelled) return;
        setSession(meBody.user);
        loadProducts(meBody.user.branchId);
      } catch {
        if (!cancelled) setLoadError("Showing sample data — couldn't reach the server.");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [loadProducts]);

  const activeProducts = liveProducts ?? PRODUCTS;

  const [liveMovements, setLiveMovements] = useState(null);
  React.useEffect(() => {
    if (tab !== "movements") return;
    fetch("/api/inventory/movements?limit=50")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body && setLiveMovements(body.movements))
      .catch(() => {});
  }, [tab]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    category: "",
    costPrice: "",
    sellingPrice: "",
    minStockLevel: "",
    unit: "Unit",
  });
  const [addError, setAddError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  async function handleAddProduct(e) {
    e.preventDefault();
    setAddError("");

    if (!newProduct.name || !newProduct.sku || !newProduct.costPrice || !newProduct.sellingPrice) {
      setAddError("Name, SKU, cost price, and selling price are required.");
      return;
    }

    setAddSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProduct.name,
          sku: newProduct.sku,
          costPrice: Number(newProduct.costPrice),
          sellingPrice: Number(newProduct.sellingPrice),
          minStockLevel: Number(newProduct.minStockLevel) || 0,
          unit: newProduct.unit || "Unit",
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAddError(body?.error ?? "Could not add this product.");
        setAddSubmitting(false);
        return;
      }

      setShowAddForm(false);
      setNewProduct({ name: "", sku: "", category: "", costPrice: "", sellingPrice: "", minStockLevel: "", unit: "Unit" });
      if (session?.branchId) loadProducts(session.branchId);
    } catch {
      setAddError("Couldn't reach the server. The product was not added.");
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
  const warn = "#B7791F";
  const bad = "#B3261E";

  const categoryOptions = useMemo(
    () => ["All Categories", ...Array.from(new Set(activeProducts.map((p) => p.category)))],
    [activeProducts]
  );

  const filtered = useMemo(() => {
    let rows = activeProducts.filter((p) => {
      const matchesQuery =
        !query ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()) ||
        p.barcode.includes(query);
      const matchesCategory = category === "All Categories" || p.category === category;
      const state = stockState(p);
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "low" && state === "low") || (statusFilter === "out" && state === "out");
      return matchesQuery && matchesCategory && matchesStatus;
    });
    rows.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "qty") return a.qty - b.qty;
      if (sortKey === "margin") return (b.price - b.cost) / b.price - (a.price - a.cost) / a.price;
      return 0;
    });
    return rows;
  }, [query, category, statusFilter, sortKey, activeProducts]);

  const totals = useMemo(() => {
    const inStock = activeProducts.filter((p) => stockState(p) === "in").length;
    const low = activeProducts.filter((p) => stockState(p) === "low").length;
    const out = activeProducts.filter((p) => stockState(p) === "out").length;
    const value = activeProducts.reduce((sum, p) => sum + p.cost * p.qty, 0);
    return { inStock, low, out, value };
  }, [activeProducts]);

  const stockBadge = (p) => {
    const state = stockState(p);
    if (state === "out") return { label: "Out of stock", color: bad, bg: dark ? "#3B1616" : "#FBE9E7", icon: PackageX };
    if (state === "low") return { label: "Low stock", color: warn, bg: dark ? "#3B2E13" : "#FBF0DD", icon: AlertTriangle };
    return { label: "In stock", color: primary, bg: dark ? "#173C26" : "#E7F5EA", icon: PackageCheck };
  };

  const movementTag = (type) => {
    if (type === "Stock In") return { color: primary, bg: dark ? "#173C26" : "#E7F5EA", icon: ArrowDownToLine };
    if (type === "Stock Out") return { color: theme.textMuted, bg: dark ? "#1B2B25" : "#F3F5F4", icon: ArrowUpFromLine };
    if (type === "Damaged") return { color: bad, bg: dark ? "#3B1616" : "#FBE9E7", icon: AlertTriangle };
    return { color: warn, bg: dark ? "#3B2E13" : "#FBF0DD", icon: SlidersHorizontal };
  };

  const movementsToShow = useMemo(() => {
    if (!liveMovements) return MOVEMENTS; // not yet loaded — sample while waiting
    const TYPE_LABEL = {
      STOCK_IN: "Stock In",
      STOCK_OUT: "Stock Out",
      ADJUSTMENT: "Adjustment",
      TRANSFER_IN: "Stock In",
      TRANSFER_OUT: "Stock Out",
      DAMAGED: "Damaged",
      EXPIRED: "Damaged",
      RETURNED: "Adjustment",
      COUNT_CORRECTION: "Adjustment",
    };
    return liveMovements.map((m) => ({
      time: new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      product: m.productName,
      type: TYPE_LABEL[m.type] ?? m.type,
      qty: m.quantity,
      ref: m.referenceId ? m.referenceId.slice(0, 8) : "—",
      user: m.userName,
    }));
  }, [liveMovements]);

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
              <img src="/brand/insight-logo-light.png" alt="Insight" style={{ height: 30, width: "auto", display: "block" }} />
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
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
          <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(221,237,226,0.55)" }}>
            Built by{" "}
            <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 600 }}>9DEVs</a>
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
            <div style={{ fontSize: 17, fontWeight: 700 }}>Inventory</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>
              {session?.business?.name ?? "Your business"} · {session?.branch?.name ?? "Main Branch"} · {activeProducts.length} products
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

        <main style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {modeNotice && appMode && !hasPos(appMode) && (
            <div role="status" style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 6, fontSize: 13, background: dark ? "#173C26" : "#E7F5EA", color: dark ? "#CFE3D6" : "#145A32", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>That page isn't available in Inventory Only mode, so you've been brought to Inventory. An owner can switch modes in Settings.</span>
              <button onClick={() => setModeNotice(false)} aria-label="Dismiss" style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}>×</button>
            </div>
          )}
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
            {[
              { label: "In Stock", value: totals.inStock, color: primary, icon: PackageCheck },
              { label: "Low Stock", value: totals.low, color: warn, icon: AlertTriangle },
              { label: "Out of Stock", value: totals.out, color: bad, icon: PackageX },
              { label: "Inventory Value", value: currency(totals.value), color: theme.text, icon: Archive },
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

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${theme.border}` }}>
            {[
              { key: "products", label: "Products" },
              { key: "movements", label: "Movement History" },
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

          {tab === "products" && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18 }}>
              {/* Toolbar */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    padding: "7px 10px",
                    flex: "1 1 240px",
                    background: dark ? theme.surfaceAlt : "#FAFCFA",
                  }}
                >
                  <Search size={15} color={theme.textMuted} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, SKU or barcode…"
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: theme.text, width: "100%" }}
                  />
                </div>

                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 13,
                    background: theme.surface,
                    color: theme.text,
                  }}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", border: `1px solid ${theme.border}`, borderRadius: 6, overflow: "hidden" }}>
                  {[
                    { key: "all", label: "All" },
                    { key: "low", label: "Low" },
                    { key: "out", label: "Out" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setStatusFilter(f.key)}
                      style={{
                        padding: "7px 12px",
                        fontSize: 12.5,
                        border: "none",
                        cursor: "pointer",
                        background: statusFilter === f.key ? primary : "transparent",
                        color: statusFilter === f.key ? "#fff" : theme.text,
                        fontWeight: 600,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setSortKey(sortKey === "name" ? "qty" : sortKey === "qty" ? "margin" : "name")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 12.5,
                    background: "transparent",
                    color: theme.text,
                    cursor: "pointer",
                  }}
                >
                  <ArrowUpDown size={13} />
                  Sort: {sortKey === "name" ? "Name" : sortKey === "qty" ? "Quantity" : "Margin"}
                </button>

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
                  Add Product
                </button>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                      {["Product", "Category", "Cost", "Price", "Margin", "Quantity", "Status", "Supplier", ""].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const badge = stockBadge(p);
                      const BadgeIcon = badge.icon;
                      const margin = ((p.price - p.cost) / p.price) * 100;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelected(p)}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "#1B2B25" : "#FAFCFA")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 11.5, color: theme.textMuted }}>{p.sku}</div>
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{p.category}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{currency(p.cost)}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{currency(p.price)}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{margin.toFixed(0)}%</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                            {p.qty} <span style={{ color: theme.textMuted, fontSize: 11.5 }}>{p.unit}</span>
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11.5,
                                fontWeight: 600,
                                padding: "3px 8px",
                                borderRadius: 4,
                                color: badge.color,
                                background: badge.bg,
                              }}
                            >
                              <BadgeIcon size={12} />
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{p.supplier}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, textAlign: "right" }}>
                            <ChevronDown size={14} color={theme.textMuted} style={{ transform: "rotate(-90deg)" }} />
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ padding: "32px 10px", textAlign: "center", color: theme.textMuted }}>
                          {activeProducts.length === 0
                            ? "No products yet. Add your first product to get started."
                            : "No products match this search or filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "movements" && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Recent Inventory Movements</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                      {["Time", "Product", "Type", "Quantity", "Reference", "User"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movementsToShow.map((m, i) => {
                      const tag = movementTag(m.type);
                      const TagIcon = tag.icon;
                      return (
                        <tr key={i}>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{m.time}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{m.product}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11.5,
                                fontWeight: 600,
                                padding: "3px 8px",
                                borderRadius: 4,
                                color: tag.color,
                                background: tag.bg,
                              }}
                            >
                              <TagIcon size={12} />
                              {m.type}
                            </span>
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: m.qty < 0 ? bad : primary, fontWeight: 600 }}>
                            {m.qty > 0 ? `+${m.qty}` : m.qty}
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{m.ref}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{m.user}</td>
                        </tr>
                      );
                    })}
                    {movementsToShow.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: "32px 10px", textAlign: "center", color: theme.textMuted }}>
                          No stock movements recorded yet. They'll appear here as sales and received purchases happen.
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

      {/* Product detail slide-over */}
      {selected && (
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
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name}</div>
              <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{selected.sku} · {selected.barcode}</div>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            {[
              ["Cost Price", currency(selected.cost)],
              ["Selling Price", currency(selected.price)],
              ["Current Quantity", `${selected.qty} ${selected.unit}`],
              ["Min / Max Stock", `${selected.min} / ${selected.max}`],
              ["Category", selected.category],
              ["Supplier", selected.supplier],
            ].map(([label, value]) => (
              <div key={label} style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: theme.textMuted }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>

          <ProductActions
            product={selected}
            session={session}
            theme={theme}
            onChanged={async () => {
              if (session?.branchId) await loadProducts(session.branchId);
              setSelected(null);
            }}
            onRemoved={async () => {
              if (session?.branchId) await loadProducts(session.branchId);
              setSelected(null);
            }}
          />
        </div>
      )}

      {/* Add Product slide-over */}
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add Product</div>
            <button
              onClick={() => setShowAddForm(false)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleAddProduct}>
            {[
              { key: "name", label: "Product Name", type: "text" },
              { key: "sku", label: "SKU", type: "text" },
              { key: "costPrice", label: "Cost Price", type: "number" },
              { key: "sellingPrice", label: "Selling Price", type: "number" },
              { key: "minStockLevel", label: "Minimum Stock Level", type: "number" },
              { key: "unit", label: "Unit (e.g. Bottle, Pack)", type: "text" },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>{field.label}</label>
                <input
                  type={field.type}
                  value={newProduct[field.key]}
                  onChange={(e) => setNewProduct((p) => ({ ...p, [field.key]: e.target.value }))}
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
              {addSubmitting ? "Adding…" : "Add Product"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
