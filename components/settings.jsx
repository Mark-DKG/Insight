"use client";

import { useAppNav, useAppMode, visibleNav, refreshAppMode, useCanChangeAppMode } from "../lib/nav";
import { Layers, ShoppingBag } from "lucide-react";
import { PackageSettings, StoreSettings } from "./store-settings";
import NotificationBell from "./notification-bell";
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
  Settings as SettingsIcon,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Bell,
  Store,
  Shield,
  Bell as BellIcon,
  Palette,
  RefreshCw,
  Plus,
  Check,
  Smartphone,
  Laptop,
  Trash2,
  AlertTriangle,
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
  { key: "settings", label: "Settings", icon: SettingsIcon },
  { key: "logout", label: "Log out", icon: LogOutIcon },
];

const SETTINGS_SECTIONS = [
  { key: "business", label: "Business", icon: Store, group: "Business Configuration" },
  { key: "mode", label: "Package", icon: Layers },
  { key: "store", label: "Insight Store", icon: ShoppingBag },
  { key: "users", label: "Users & Roles", icon: Shield, group: "General" },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "pos", label: "Point of Sale", icon: ShoppingCart },
  { key: "notifications", label: "Notifications", icon: BellIcon },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "sync", label: "Synchronization", icon: RefreshCw },
];

const USERS = [
  { id: "U-001", name: "Owusu Ansah", email: "owusu@riversidemart.com", role: "Owner", status: "Active" },
  { id: "U-002", name: "Ama Owusu", email: "ama.owusu@riversidemart.com", role: "Cashier", status: "Active" },
  { id: "U-003", name: "Kojo Mensah", email: "kojo.mensah@riversidemart.com", role: "Cashier", status: "Active" },
  { id: "U-004", name: "Efua Danso", email: "efua.danso@riversidemart.com", role: "Manager", status: "Suspended" },
];

const DEVICES = [
  { id: "D-001", name: "Main Counter (Windows)", icon: Laptop, lastSync: "2 minutes ago", status: "Online" },
  { id: "D-002", name: "Tema Branch Tablet", icon: Smartphone, lastSync: "18 minutes ago", status: "Online" },
  { id: "D-003", name: "Owner's Phone", icon: Smartphone, lastSync: "Yesterday, 19:40", status: "Offline" },
];

function Toggle({ checked, onChange, color, border }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 21, borderRadius: 11, border: `1px solid ${border}`, cursor: "pointer",
        background: checked ? color : "transparent", position: "relative", padding: 0, flexShrink: 0,
      }}
      aria-pressed={checked}
    >
      <span style={{
        position: "absolute", top: 1, left: checked ? 18 : 1, width: 17, height: 17, borderRadius: "50%",
        background: checked ? "#fff" : border, transition: "left 0.15s ease",
      }} />
    </button>
  );
}

export default function InsightSettings() {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active] = useState("settings");
  const navigate = useAppNav();
  const appMode = useAppMode(active);
  const canChangeMode = useCanChangeAppMode();
  const [section, setSection] = useState("business");
  React.useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("section");
    if (wanted && SETTINGS_SECTIONS.some((s) => s.key === wanted)) setSection(wanted);
  }, []);

  const [liveUsers, setLiveUsers] = useState(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteData, setInviteData] = useState({ name: "", email: "", password: "", role: "CASHIER" });
  const [inviteError, setInviteError] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const ROLE_LABEL = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier" };

  const loadUsers = React.useCallback(async () => {
    try {
      const res = await fetch("/api/employees");
      if (!res.ok) return;
      const body = await res.json();
      setLiveUsers(
        body.employees.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: ROLE_LABEL[u.role] ?? u.role,
          status: u.isActive ? "Active" : "Suspended",
        }))
      );
    } catch {
      // Falls back to the static sample roster below.
    }
  }, []);

  React.useEffect(() => {
    loadUsers();
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body) return;
        setSession(body.user);
        if (body.user.business?.name) setBusinessName(body.user.business.name);
      })
      .catch(() => {});
    fetch("/api/business")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const b = body?.business;
        if (!b) return;
        setBusinessName(b.name ?? "");
        setBizPhone(b.phone ?? "");
        setBizEmail(b.email ?? "");
        setBizAddress(b.address ?? "");
        setTaxRate(String(Number(b.taxRate ?? 0)));
        const match = ["GHS — Ghanaian Cedi", "NGN — Nigerian Naira", "USD — US Dollar"].find((c) => c.startsWith(b.currency));
        if (match) setCurrency(match);
      })
      .catch(() => {});
  }, [loadUsers]);

  const usersToShow = liveUsers ?? USERS;

  async function saveBusiness() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName,
          phone: bizPhone || null,
          email: bizEmail,
          address: bizAddress || null,
          currency: currency.slice(0, 3),
          taxRate: Number(taxRate) || 0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveStatus({ ok: false, text: body?.error ?? "Could not save your changes." });
      } else {
        setSaveStatus({ ok: true, text: "Changes saved." });
      }
    } catch {
      setSaveStatus({ ok: false, text: "Couldn't reach the server. Nothing was saved." });
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviteError("");

    if (!inviteData.name || !inviteData.email || inviteData.password.length < 8) {
      setInviteError("Name, email, and a password of at least 8 characters are required.");
      return;
    }

    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteData),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setInviteError(body?.error ?? "Could not invite this user.");
        setInviteSubmitting(false);
        return;
      }

      setShowInviteForm(false);
      setInviteData({ name: "", email: "", password: "", role: "CASHIER" });
      await loadUsers();
    } catch {
      setInviteError("Couldn't reach the server. The user was not added.");
    } finally {
      setInviteSubmitting(false);
    }
  }

  const [session, setSession] = useState(null);
  const [businessName, setBusinessName] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // { ok: boolean, text: string }
  const [currency, setCurrency] = useState("GHS — Ghanaian Cedi");
  const [taxRate, setTaxRate] = useState("0");

  const [lowStockThreshold, setLowStockThreshold] = useState("15");
  const [costingMethod, setCostingMethod] = useState("FIFO");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  const [receiptFooter, setReceiptFooter] = useState("Thank you for shopping with us!");
  const [roundTotals, setRoundTotals] = useState(true);
  const [requireCustomerForCredit, setRequireCustomerForCredit] = useState(true);

  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyCreditDue, setNotifyCreditDue] = useState(true);
  const [notifySyncErrors, setNotifySyncErrors] = useState(true);
  const [notifyDeadStock, setNotifyDeadStock] = useState(false);

  const [autoSync, setAutoSync] = useState(true);

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

  const inputStyle = {
    width: "100%", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 11px",
    fontSize: 13, background: dark ? theme.surfaceAlt : "#FAFCFA", color: theme.text,
  };
  const label = { fontSize: 12.5, fontWeight: 600, marginBottom: 6, display: "block" };
  const fieldWrap = { marginBottom: 16 };

  const roleStyle = (role) => {
    if (role === "Owner") return { color: deep, bg: dark ? "#1B2B25" : "#EAF2EE" };
    if (role === "Manager") return { color: primary, bg: dark ? "#173C26" : "#E7F5EA" };
    return { color: theme.textMuted, bg: dark ? "#1B2B25" : "#F3F5F4" };
  };

  const SaveBar = ({ onSave }) =>
    onSave ? (
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
        {saveStatus && (
          <span role="status" style={{ fontSize: 12.5, color: saveStatus.ok ? primary : bad }}>{saveStatus.text}</span>
        )}
        <button onClick={onSave} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 6, padding: "9px 18px", background: primary, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
          <Check size={14} /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    ) : (
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted }}>
        These preferences apply to this session only and are not saved to your account yet.
      </div>
    );

  const Card = ({ children, style }) => (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 20, ...style }}>{children}</div>
  );

  const Row = ({ title, description, children }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ paddingRight: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {description && <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>{description}</div>}
      </div>
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
            <div style={{ fontSize: 17, fontWeight: 700 }}>Settings</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 1 }}>{session?.business?.name ?? "Your business"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setDark((d) => !d)} aria-label="Toggle theme" style={{ background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, cursor: "pointer", color: theme.text, display: "flex" }}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <NotificationBell theme={theme} dark={dark} />
            <div style={{ width: 32, height: 32, borderRadius: 6, background: deep, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>OA</div>
          </div>
        </header>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Settings sub-nav */}
          <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${theme.border}`, padding: "18px 10px", background: theme.surface }}>
            {SETTINGS_SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = section === s.key;
              return (
                <React.Fragment key={s.key}>
                {s.group && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: theme.textMuted, padding: "10px 12px 4px" }}>{s.group}</div>}
                <button
                  onClick={() => { setSection(s.key); try { window.history.replaceState(null, "", `?section=${s.key}`); } catch {} }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 2,
                    borderRadius: 6, border: "none", cursor: "pointer", textAlign: "left",
                    background: isActive ? (dark ? "#1B2B25" : "#F0FFF0") : "transparent",
                    color: isActive ? primary : theme.text, fontWeight: isActive ? 700 : 500, fontSize: 13,
                  }}
                >
                  <Icon size={15} />
                  {s.label}
                </button>
                </React.Fragment>
              );
            })}
          </div>

          <main style={{ padding: 24, overflowY: "auto", flex: 1 }}>
            {section === "business" && (
              <Card style={{ maxWidth: 640 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Business Profile</div>
                <div style={fieldWrap}>
                  <label style={label}>Business Name</label>
                  <input style={inputStyle} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={fieldWrap}>
                    <label style={label}>Phone</label>
                    <input style={inputStyle} placeholder="e.g. 030 220 4471" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} />
                  </div>
                  <div style={fieldWrap}>
                    <label style={label}>Email</label>
                    <input style={inputStyle} placeholder="e.g. hello@yourbusiness.com" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} />
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={label}>Address</label>
                  <input style={inputStyle} placeholder="Street address" value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={fieldWrap}>
                    <label style={label}>Currency</label>
                    <select style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option>GHS — Ghanaian Cedi</option>
                      <option>NGN — Nigerian Naira</option>
                      <option>USD — US Dollar</option>
                    </select>
                  </div>
                  <div style={fieldWrap}>
                    <label style={label}>Default Tax Rate (%)</label>
                    <input type="number" style={inputStyle} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                  </div>
                </div>
                <SaveBar onSave={saveBusiness} />
              </Card>
            )}

            {section === "mode" && (
              <PackageSettings theme={theme} dark={dark} card={Card} appMode={appMode} canChange={canChangeMode}
                onChanged={refreshAppMode} onOpenStore={() => setSection("store")} />
            )}

            {section === "store" && (
              <StoreSettings theme={theme} dark={dark} card={Card} inputStyle={inputStyle} label={label} appMode={appMode} />
            )}

            {section === "users" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Users & Roles</div>
                  <button onClick={() => setShowInviteForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, background: primary, color: "#fff", cursor: "pointer" }}>
                    <Plus size={15} /> Invite User
                  </button>
                </div>
                <Card>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: theme.textMuted, fontSize: 11.5 }}>
                          {["Name", "Email", "Role", "Status", ""].map((h) => (
                            <th key={h} style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {usersToShow.map((u) => {
                          const rs = roleStyle(u.role);
                          return (
                            <tr key={u.id}>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{u.name}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>{u.email}</td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                                <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: rs.color, background: rs.bg }}>{u.role}</span>
                              </td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}` }}>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: u.status === "Active" ? primary : bad }}>{u.status}</span>
                              </td>
                              <td style={{ padding: "10px", borderBottom: `1px solid ${theme.border}`, textAlign: "right" }}>
                                <button style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer" }}>
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {section === "inventory" && (
              <Card style={{ maxWidth: 640 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Inventory Policy</div>
                <div style={fieldWrap}>
                  <label style={label}>Default Low-Stock Threshold (units)</label>
                  <input type="number" style={inputStyle} value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={label}>Costing Method</label>
                  <select style={inputStyle} value={costingMethod} onChange={(e) => setCostingMethod(e.target.value)}>
                    <option>FIFO</option>
                    <option>Weighted Average</option>
                    <option>Last Cost</option>
                  </select>
                </div>
                <Row title="Allow Negative Stock" description="Permit sales to push a product's stock below zero. Restricted to administrators.">
                  <Toggle checked={allowNegativeStock} onChange={setAllowNegativeStock} color={primary} border={theme.border} />
                </Row>
                {allowNegativeStock && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, padding: 10, borderRadius: 6, background: dark ? "#3B2E13" : "#FBF0DD", fontSize: 12, color: warn }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    Enabling this can let sales be recorded for products that are technically out of stock. Only enable it if you understand the reconciliation impact.
                  </div>
                )}
                <SaveBar />
              </Card>
            )}

            {section === "pos" && (
              <Card style={{ maxWidth: 640 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Point of Sale</div>
                <div style={fieldWrap}>
                  <label style={label}>Receipt Footer Message</label>
                  <input style={inputStyle} value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} />
                </div>
                <Row title="Round Totals to Nearest Unit" description="Round the final sale total to the nearest whole currency unit.">
                  <Toggle checked={roundTotals} onChange={setRoundTotals} color={primary} border={theme.border} />
                </Row>
                <Row title="Require Customer for Credit Sales" description="Block completing a Credit payment method sale without selecting a customer.">
                  <Toggle checked={requireCustomerForCredit} onChange={setRequireCustomerForCredit} color={primary} border={theme.border} />
                </Row>
                <SaveBar />
              </Card>
            )}

            {section === "notifications" && (
              <Card style={{ maxWidth: 640 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Notification Preferences</div>
                <Row title="Low Stock Alerts" description="Notify when a product falls below its minimum stock level.">
                  <Toggle checked={notifyLowStock} onChange={setNotifyLowStock} color={primary} border={theme.border} />
                </Row>
                <Row title="Customer Credit Due" description="Notify when a customer's credit payment is due or overdue.">
                  <Toggle checked={notifyCreditDue} onChange={setNotifyCreditDue} color={primary} border={theme.border} />
                </Row>
                <Row title="Dead Stock Alerts" description="Notify when products haven't sold within your configured window.">
                  <Toggle checked={notifyDeadStock} onChange={setNotifyDeadStock} color={primary} border={theme.border} />
                </Row>
                <Row title="Synchronization Errors" description="Notify when an offline transaction fails to sync and needs review.">
                  <Toggle checked={notifySyncErrors} onChange={setNotifySyncErrors} color={primary} border={theme.border} />
                </Row>
                <SaveBar />
              </Card>
            )}

            {section === "appearance" && (
              <Card style={{ maxWidth: 640 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Appearance</div>
                <Row title="Dark Mode" description="Applies across the entire application and is remembered on this device.">
                  <Toggle checked={dark} onChange={setDark} color={primary} border={theme.border} />
                </Row>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 12 }}>
                  Interface preferences (density, sidebar default state) are saved per device.
                </div>
              </Card>
            )}

            {section === "sync" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
                <Card>
                  <Row title="Automatic Synchronization" description="Sync queued transactions automatically whenever a connection is available.">
                    <Toggle checked={autoSync} onChange={setAutoSync} color={primary} border={theme.border} />
                  </Row>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12.5, color: theme.textMuted }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: primary, display: "inline-block" }} />
                    Online — Synced
                  </div>
                </Card>

                <Card>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Connected Devices</div>
                  <div style={{ fontSize: 12.5, color: theme.textMuted, padding: "8px 0" }}>
                    Device tracking isn't set up yet — this device is the only known session right now.
                  </div>
                </Card>

                <Card>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Conflict Log</div>
                  <div style={{ fontSize: 12.5, color: theme.textMuted }}>No unresolved synchronization conflicts.</div>
                </Card>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Invite User slide-over */}
      {showInviteForm && (
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
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Invite User</div>
            <button
              onClick={() => setShowInviteForm(false)}
              aria-label="Close"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleInvite}>
            <div style={fieldWrap}>
              <label style={label}>Name</label>
              <input style={inputStyle} value={inviteData.name} onChange={(e) => setInviteData((x) => ({ ...x, name: e.target.value }))} />
            </div>
            <div style={fieldWrap}>
              <label style={label}>Email</label>
              <input type="email" style={inputStyle} value={inviteData.email} onChange={(e) => setInviteData((x) => ({ ...x, email: e.target.value }))} />
            </div>
            <div style={fieldWrap}>
              <label style={label}>Temporary Password</label>
              <input style={inputStyle} value={inviteData.password} onChange={(e) => setInviteData((x) => ({ ...x, password: e.target.value }))} placeholder="At least 8 characters" />
            </div>
            <div style={fieldWrap}>
              <label style={label}>Role</label>
              <select style={inputStyle} value={inviteData.role} onChange={(e) => setInviteData((x) => ({ ...x, role: e.target.value }))}>
                <option value="CASHIER">Cashier</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>

            {inviteError && (
              <div style={{ marginBottom: 16, padding: "9px 12px", borderRadius: 6, background: dark ? "#3B1616" : "#FBE9E7", color: bad, fontSize: 12.5 }}>
                {inviteError}
              </div>
            )}

            <button
              type="submit"
              disabled={inviteSubmitting}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", borderRadius: 6, padding: "10px 0", background: primary, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: inviteSubmitting ? "not-allowed" : "pointer", opacity: inviteSubmitting ? 0.75 : 1 }}
            >
              {inviteSubmitting ? "Inviting…" : "Invite User"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
