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
  Clock,
  CheckCircle2,
  PackageCheck,
  TrendingDown,
  ChevronDown,
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

const PURCHASES = [
  { id: "PO-2214", supplier: "West Africa Foods", status: "Received", ordered: "5 Sep", expected: "6 Sep", total: 3360.0, items: 2 },
  { id: "PO-2213", supplier: "Kama Distributors", status: "Partially Received", ordered: "3 Sep", expected: "7 Sep", total: 5280.0, items: 4 },
  { id: "PO-2212", supplier: "Accra Beverage Co.", status: "Ordered", ordered: "2 Sep", expected: "9 Sep", total: 2140.0, items: 3 },
  { id: "PO-2211", supplier: "Fan Milk Ltd.", status: "Received", ordered: "28 Aug", expected: "30 Aug", total: 990.0, items: 1 },
  { id: "PO-2210", supplier: "Kama Distributors", status: "Draft", ordered: "—", expected: "—", total: 1450.0, items: 2 },
];

const SUPPLIERS = [
  {
    id: "S-001",
    name: "Kama Distributors",
    phone: "030 220 1145",
    email: "orders@kamadist.com",
    address: "Tema Industrial Area",
    balance: 5280.0,
    reliability: "High",
    products: [
      { name: "Sunlight Cooking Oil 2L", price: 24.0, competitor: "Elsewhere Ltd.", competitorPrice: 24.0 },
      { name: "Dettol Soap 100g", price: 5.6, competitor: "West Africa Foods", competitorPrice: 5.9 },
    ],
  },
  {
    id: "S-002",
    name: "West Africa Foods",
    phone: "024 771 9034",
    email: "sales@waf.com.gh",
    address: "Spintex, Accra",
    balance: 0,
    reliability: "High",
    products: [
      { name: "Indomie Chicken 70g", price: 2.1, competitor: "Kama Distributors", competitorPrice: 2.25 },
      { name: "Peace Detergent Powder 1kg", price: 14.0, competitor: "Kama Distributors", competitorPrice: 13.4 },
    ],
  },
  {
    id: "S-003",
    name: "Accra Beverage Co.",
    phone: "020 118 4402",
    email: "info@accrabev.com",
    address: "Achimota, Accra",
    balance: 2140.0,
    reliability: "Medium",
    products: [{ name: "Malta Guinness 330ml", price: 4.2, competitor: null, competitorPrice: null }],
  },
  {
    id: "S-004",
    name: "Fan Milk Ltd.",
    phone: "030 277 6612",
    email: "orders@fanmilk.com",
    address: "Kaneshie, Accra",
    balance: 0,
    reliability: "High",
    products: [{ name: "Fan Milk Yoghurt 500ml", price: 9.0, competitor: null, competitorPrice: null }],
  },
];

const currency = (n) =>
  `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InsightPurchases() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active] = useState("purchases");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const [tab, setTab] = useState("purchases"); // purchases | suppliers
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "suppliers") setTab("suppliers");
  }, []);
  const [query, setQuery] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState(SUPPLIERS[0].id);

  const [session, setSession] = useState(null);
  const [liveSuppliers, setLiveSuppliers] = useState(null);
  const [livePurchases, setLivePurchases] = useState(null);
  const [liveProducts, setLiveProducts] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null); // { supplier, priceComparison } for the selected one

  const [showPOForm, setShowPOForm] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poLines, setPoLines] = useState([{ productId: "", quantityOrdered: "", unitCost: "" }]);
  const [poError, setPoError] = useState("");
  const [poSubmitting, setPoSubmitting] = useState(false);

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", email: "", address: "" });
  const [supplierError, setSupplierError] = useState("");
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);

  const loadAll = React.useCallback(async () => {
    try {
      const [suppliersRes, purchasesRes, productsRes, meRes] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/purchases"),
        fetch("/api/products?pageSize=100"),
        fetch("/api/auth/me"),
      ]);
      if (suppliersRes.ok) setLiveSuppliers((await suppliersRes.json()).suppliers);
      if (purchasesRes.ok) setLivePurchases((await purchasesRes.json()).purchases);
      if (productsRes.ok) setLiveProducts((await productsRes.json()).items);
      if (meRes.ok) setSession((await meRes.json()).user);
    } catch {
      // Falls back to the static sample data below.
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  React.useEffect(() => {
    if (!liveSuppliers || liveSuppliers.length === 0) return;
    const id = liveSuppliers.some((s) => s.id === selectedSupplierId) ? selectedSupplierId : liveSuppliers[0].id;
    fetch(`/api/suppliers/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body && setSupplierDetail(body))
      .catch(() => {});
  }, [liveSuppliers, selectedSupplierId]);

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

  const statusStyle = (status) => {
    if (status === "Received") return { color: primary, bg: dark ? "#173C26" : "#E7F5EA", icon: PackageCheck };
    if (status === "Partially Received") return { color: warn, bg: dark ? "#3B2E13" : "#FBF0DD", icon: Clock };
    if (status === "Ordered") return { color: deep, bg: dark ? "#1B2B25" : "#EAF2EE", icon: Truck };
    return { color: theme.textMuted, bg: dark ? "#1B2B25" : "#F3F5F4", icon: Clock };
  };

  const PURCHASE_STATUS_LABEL = {
    DRAFT: "Draft",
    ORDERED: "Ordered",
    PARTIALLY_RECEIVED: "Partially Received",
    RECEIVED: "Received",
    CANCELLED: "Cancelled",
  };

  const purchasesToShow = useMemo(() => {
    if (!livePurchases) return PURCHASES;
    return livePurchases.map((p) => ({
      id: p.id.slice(0, 8),
      fullId: p.id,
      supplier: p.supplier?.name ?? "—",
      status: PURCHASE_STATUS_LABEL[p.status] ?? p.status,
      ordered: p.orderedAt ? new Date(p.orderedAt).toLocaleDateString() : "—",
      expected: p.expectedAt ? new Date(p.expectedAt).toLocaleDateString() : "—",
      total: Number(p.totalCost),
      items: p.items?.length ?? 0,
    }));
  }, [livePurchases]);

  const suppliersToShow = useMemo(() => {
    if (!liveSuppliers) return SUPPLIERS; // not yet loaded — show sample while waiting
    if (liveSuppliers.length === 0) return []; // genuinely no suppliers yet
    return liveSuppliers.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone ?? "—",
      email: s.email ?? "—",
      address: s.address ?? "—",
      balance: Number(s.outstandingBalance),
      reliability: s._count?.purchases > 5 ? "High" : s._count?.purchases > 0 ? "Medium" : "New",
      products: s.products ?? [],
    }));
  }, [liveSuppliers]);

  const filteredPurchases = useMemo(
    () => purchasesToShow.filter((p) => !query || p.supplier.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase().includes(query.toLowerCase())),
    [query, purchasesToShow]
  );

  const filteredSuppliers = useMemo(
    () => suppliersToShow.filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase())),
    [query, suppliersToShow]
  );

  const selectedSupplier = suppliersToShow.find((s) => s.id === selectedSupplierId) ?? suppliersToShow[0] ?? null;

  // When live data is loaded, prefer the server-computed price comparison
  // (matches same-SKU products across suppliers) once it's arrived; before
  // that (or for the sample data), fall back to a plain per-product list
  // with the same field names so the render below never sees a shape it
  // doesn't expect.
  const priceComparisonRows =
    liveSuppliers && selectedSupplier && supplierDetail?.supplier?.id === selectedSupplier.id
      ? (supplierDetail.priceComparison ?? []).map((row) => ({
          name: row.product,
          price: row.currentPrice,
          competitor: row.alternativeSupplier,
          competitorPrice: row.alternativePrice,
        }))
      : liveSuppliers
      ? (selectedSupplier?.products ?? []).map((p) => ({
          name: p.name,
          price: Number(p.costPrice),
          competitor: null,
          competitorPrice: null,
        }))
      : selectedSupplier?.products ?? [];

  const totals = useMemo(() => {
    const outstanding = suppliersToShow.reduce((s, sup) => s + sup.balance, 0);
    const openOrders = purchasesToShow.filter((p) => p.status === "Ordered" || p.status === "Partially Received").length;
    const thisMonthSpend = purchasesToShow.reduce((s, p) => s + p.total, 0);
    return { outstanding, openOrders, thisMonthSpend };
  }, [suppliersToShow, purchasesToShow]);

  const [receivingPurchase, setReceivingPurchase] = useState(null); // raw purchase object with items
  const [receiveQuantities, setReceiveQuantities] = useState({}); // purchaseItemId -> string
  const [receiveError, setReceiveError] = useState("");
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);

  function openReceive(fullId) {
    const purchase = (livePurchases ?? []).find((p) => p.id === fullId);
    if (!purchase) return;
    setReceiveError("");
    setReceiveQuantities({});
    setReceivingPurchase(purchase);
  }

  async function submitReceive() {
    setReceiveError("");
    const lines = Object.entries(receiveQuantities)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([purchaseItemId, qty]) => ({ purchaseItemId, quantityReceived: Number(qty) }));

    if (lines.length === 0) {
      setReceiveError("Enter a quantity for at least one item.");
      return;
    }

    setReceiveSubmitting(true);
    try {
      const res = await fetch(`/api/purchases/${receivingPurchase.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setReceiveError(body?.error ?? "Could not receive this stock.");
        setReceiveSubmitting(false);
        return;
      }

      setReceivingPurchase(null);
      await loadAll();
    } catch {
      setReceiveError("Couldn't reach the server. Nothing was received.");
    } finally {
      setReceiveSubmitting(false);
    }
  }

  function updatePoLine(index, field, value) {
    setPoLines((lines) => lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }
  function addPoLine() {
    setPoLines((lines) => [...lines, { productId: "", quantityOrdered: "", unitCost: "" }]);
  }
  function removePoLine(index) {
    setPoLines((lines) => lines.filter((_, i) => i !== index));
  }

  async function handleCreatePurchase(e) {
    e.preventDefault();
    setPoError("");

    if (!poSupplierId) {
      setPoError("Select a supplier.");
      return;
    }
    const validLines = poLines.filter((l) => l.productId && l.quantityOrdered && l.unitCost);
    if (validLines.length === 0) {
      setPoError("Add at least one line with a product, quantity, and unit cost.");
      return;
    }
    if (!session?.branchId) {
      setPoError("Could not determine your branch. Try refreshing the page.");
      return;
    }

    setPoSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: session.branchId,
          supplierId: poSupplierId,
          items: validLines.map((l) => ({
            productId: l.productId,
            quantityOrdered: Number(l.quantityOrdered),
            unitCost: Number(l.unitCost),
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPoError(body?.error ?? "Could not create the purchase order.");
        setPoSubmitting(false);
        return;
      }

      setShowPOForm(false);
      setPoSupplierId("");
      setPoLines([{ productId: "", quantityOrdered: "", unitCost: "" }]);
      await loadAll();
    } catch {
      setPoError("Couldn't reach the server. The purchase order was not created.");
    } finally {
      setPoSubmitting(false);
    }
  }

  async function handleAddSupplier(e) {
    e.preventDefault();
    setSupplierError("");

    if (!newSupplier.name) {
      setSupplierError("Supplier name is required.");
      return;
    }

    setSupplierSubmitting(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSupplier.name,
          phone: newSupplier.phone || undefined,
          email: newSupplier.email || undefined,
          address: newSupplier.address || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSupplierError(body?.error ?? "Could not add this supplier.");
        setSupplierSubmitting(false);
        return;
      }

      setShowSupplierForm(false);
      setNewSupplier({ name: "", phone: "", email: "", address: "" });
      await loadAll();
    } catch {
      setSupplierError("Couldn't reach the server. The supplier was not added.");
    } finally {
      setSupplierSubmitting(false);
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
        {!collapsed && (
          <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(221,237,226,0.55)" }}>
            Built by{" "}
            <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 600 }}>9DEVs</a>
          </div>
        )}
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
            <div style={{ fontSize: 17, fontWeight: 700 }}>Purchases & Suppliers</div>
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
            <NotificationBell theme={theme} dark={dark} />
            <div style={{ width: 32, height: 32, borderRadius: 6, background: deep, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>
              OA
            </div>
          </div>
        </header>

        <main style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
            {[
              { label: "Outstanding to Suppliers", value: currency(totals.outstanding), color: warn },
              { label: "Open Orders", value: totals.openOrders, color: theme.text },
              { label: "Purchases (This Period)", value: currency(totals.thisMonthSpend), color: theme.text },
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
              { key: "purchases", label: "Purchase Orders" },
              { key: "suppliers", label: "Suppliers" },
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

          {tab === "purchases" && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
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
                    placeholder="Search purchase order or supplier…"
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: theme.text, width: "100%" }}
                  />
                </div>
                <button
                  onClick={() => setShowPOForm(true)}
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
                  New Purchase Order
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                      {["Order", "Supplier", "Ordered", "Expected", "Items", "Total", "Status", ""].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPurchases.map((p) => {
                      const s = statusStyle(p.status);
                      const StatusIcon = s.icon;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => p.fullId && openReceive(p.fullId)}
                          style={{ cursor: p.fullId && (p.status === "Ordered" || p.status === "Partially Received") ? "pointer" : "default" }}
                        >
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{p.id}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{p.supplier}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{p.ordered}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{p.expected}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>{p.items}</td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{currency(p.total)}</td>
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
                                color: s.color,
                                background: s.bg,
                              }}
                            >
                              <StatusIcon size={12} />
                              {p.status}
                            </span>
                          </td>
                          <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, textAlign: "right" }}>
                            {p.fullId && (p.status === "Ordered" || p.status === "Partially Received") ? (
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: primary }}>Receive</span>
                            ) : (
                              <ChevronDown size={14} color={theme.textMuted} style={{ transform: "rotate(-90deg)" }} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPurchases.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: "32px 10px", textAlign: "center", color: theme.textMuted }}>
                          {purchasesToShow.length === 0
                            ? "No purchase orders yet. Create one to restock your inventory."
                            : "No purchase orders match this search."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "suppliers" && (
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ flex: 1, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    padding: "7px 10px",
                    marginBottom: 12,
                    background: dark ? theme.surfaceAlt : "#FAFCFA",
                  }}
                >
                  <Search size={15} color={theme.textMuted} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search suppliers…"
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: theme.text, width: "100%" }}
                  />
                </div>
                {filteredSuppliers.map((s) => {
                  const isSelected = s.id === selectedSupplierId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSupplierId(s.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 10px",
                        border: "none",
                        borderBottom: `1px solid ${theme.border}`,
                        background: isSelected ? (dark ? "#1B2B25" : "#F5FBF6") : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>Reliability: {s.reliability}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: s.balance > 0 ? warn : primary }}>
                        {s.balance > 0 ? currency(s.balance) : "Settled"}
                      </div>
                    </button>
                  );
                })}
                {filteredSuppliers.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: theme.textMuted, fontSize: 12.5 }}>
                    {suppliersToShow.length === 0 ? "No suppliers yet." : "No suppliers match this search."}
                  </div>
                )}
                <button
                  onClick={() => setShowSupplierForm(true)}
                  style={{
                    width: "100%",
                    marginTop: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    padding: "9px 0",
                    background: "transparent",
                    color: theme.text,
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} />
                  Add Supplier
                </button>
              </div>

              {/* Supplier detail */}
              {selectedSupplier ? (
              <div style={{ width: 380, flexShrink: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 4 }}>{selectedSupplier.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 14 }}>Supplier {selectedSupplier.id}</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: theme.textMuted, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Phone size={13} /> {selectedSupplier.phone}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Mail size={13} /> {selectedSupplier.email}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MapPin size={13} /> {selectedSupplier.address}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>Outstanding Balance</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: selectedSupplier.balance > 0 ? warn : primary }}>
                      {currency(selectedSupplier.balance)}
                    </div>
                  </div>
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>Reliability</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{selectedSupplier.reliability}</div>
                  </div>
                </div>

                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Price Comparison</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {priceComparisonRows.map((p, i) => {
                    const saving = p.competitor ? (p.competitorPrice - p.price) * 10 : null; // illustrative per-10-unit saving
                    return (
                      <div key={i} style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "10px 11px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          {selectedSupplier.name}: <span style={{ color: theme.text, fontWeight: 600 }}>{currency(p.price)}</span>
                        </div>
                        {p.competitor && (
                          <>
                            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                              {p.competitor}: {currency(p.competitorPrice)}
                            </div>
                            {saving > 0 && (
                              <div style={{ fontSize: 11.5, color: primary, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                                <TrendingDown size={12} /> Potential saving: {currency(saving)} per 10 units
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              ) : (
                <div style={{ width: 380, flexShrink: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
                  Add a supplier to see their details here.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* New Purchase Order slide-over */}
      {showPOForm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 400,
            background: theme.surface,
            borderLeft: `1px solid ${theme.border}`,
            padding: 22,
            boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>New Purchase Order</div>
            <button
              onClick={() => setShowPOForm(false)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleCreatePurchase}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>Supplier</label>
              <select
                value={poSupplierId}
                onChange={(e) => setPoSupplierId(e.target.value)}
                style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
              >
                <option value="">Select a supplier…</option>
                {suppliersToShow.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: "block" }}>Items</label>
            {poLines.map((line, i) => (
              <div key={i} style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <select
                  value={line.productId}
                  onChange={(e) => updatePoLine(i, "productId", e.target.value)}
                  style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 5, padding: "6px 8px", fontSize: 12.5, marginBottom: 6, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
                >
                  <option value="">Select a product…</option>
                  {(liveProducts ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={line.quantityOrdered}
                    onChange={(e) => updatePoLine(i, "quantityOrdered", e.target.value)}
                    style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 5, padding: "6px 8px", fontSize: 12.5, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
                  />
                  <input
                    type="number"
                    placeholder="Unit cost"
                    value={line.unitCost}
                    onChange={(e) => updatePoLine(i, "unitCost", e.target.value)}
                    style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 5, padding: "6px 8px", fontSize: 12.5, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
                  />
                  {poLines.length > 1 && (
                    <button type="button" onClick={() => removePoLine(i)} style={{ background: "transparent", border: "none", color: bad, cursor: "pointer", padding: "0 4px" }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addPoLine}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: primary, fontWeight: 600, fontSize: 12.5, cursor: "pointer", marginBottom: 16, padding: 0 }}
            >
              <Plus size={13} /> Add another line
            </button>

            {poError && (
              <div style={{ marginBottom: 14, padding: "8px 11px", borderRadius: 6, background: dark ? "#3B1616" : "#FBE9E7", color: bad, fontSize: 12 }}>
                {poError}
              </div>
            )}

            <button
              type="submit"
              disabled={poSubmitting}
              style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: primary, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: poSubmitting ? "not-allowed" : "pointer", opacity: poSubmitting ? 0.75 : 1 }}
            >
              {poSubmitting ? "Creating…" : "Create Purchase Order"}
            </button>
          </form>
        </div>
      )}

      {/* Add Supplier slide-over */}
      {showSupplierForm && (
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add Supplier</div>
            <button
              onClick={() => setShowSupplierForm(false)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleAddSupplier}>
            {[
              { key: "name", label: "Name" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
              { key: "address", label: "Address" },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, display: "block" }}>{field.label}</label>
                <input
                  value={newSupplier[field.key]}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, [field.key]: e.target.value }))}
                  style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px", fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
                />
              </div>
            ))}

            {supplierError && (
              <div style={{ marginBottom: 14, padding: "8px 11px", borderRadius: 6, background: dark ? "#3B1616" : "#FBE9E7", color: bad, fontSize: 12 }}>
                {supplierError}
              </div>
            )}

            <button
              type="submit"
              disabled={supplierSubmitting}
              style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: primary, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: supplierSubmitting ? "not-allowed" : "pointer", opacity: supplierSubmitting ? 0.75 : 1 }}
            >
              {supplierSubmitting ? "Adding…" : "Add Supplier"}
            </button>
          </form>
        </div>
      )}
      {/* Receive Stock modal */}
      {receivingPurchase && (
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
          <div style={{ background: theme.surface, borderRadius: 10, width: 420, padding: 22, border: `1px solid ${theme.border}`, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Receive Stock</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{receivingPurchase.supplier?.name}</div>
              </div>
              <button
                onClick={() => setReceivingPurchase(null)}
                aria-label="Close"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
              >
                <X size={18} />
              </button>
            </div>

            {receivingPurchase.items.map((item) => {
              const remaining = item.quantityOrdered - item.quantityReceived;
              return (
                <div key={item.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{item.product?.name}</div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 8 }}>
                    Ordered {item.quantityOrdered} · Received {item.quantityReceived} · Remaining {remaining}
                  </div>
                  {remaining > 0 ? (
                    <input
                      type="number"
                      max={remaining}
                      min={0}
                      placeholder={`Up to ${remaining}`}
                      value={receiveQuantities[item.id] ?? ""}
                      onChange={(e) => setReceiveQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
                      style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 5, padding: "6px 8px", fontSize: 12.5, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text }}
                    />
                  ) : (
                    <div style={{ fontSize: 11.5, color: primary, fontWeight: 600 }}>Fully received</div>
                  )}
                </div>
              );
            })}

            {receiveError && (
              <div style={{ marginBottom: 14, padding: "8px 11px", borderRadius: 6, background: dark ? "#3B1616" : "#FBE9E7", color: bad, fontSize: 12 }}>
                {receiveError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setReceivingPurchase(null)}
                style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={submitReceive}
                disabled={receiveSubmitting}
                style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "none", background: primary, color: "#fff", fontWeight: 600, fontSize: 13, cursor: receiveSubmitting ? "not-allowed" : "pointer", opacity: receiveSubmitting ? 0.75 : 1 }}
              >
                {receiveSubmitting ? "Receiving…" : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
