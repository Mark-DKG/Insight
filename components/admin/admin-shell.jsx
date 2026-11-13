"use client";

import React, { useEffect, useState, useMemo, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, GitBranch, ShieldCheck, LineChart, Activity, RefreshCw, ScrollText,
  LifeBuoy, HardDrive, Bell, Flag, Settings, Lock, LogOut, Sun, Moon, Menu, X, ShoppingBag, Mail,
} from "lucide-react";
import NotificationBell from "../notification-bell";
import { ADMIN_THEMES, Button, Card, Notice, inputStyle } from "./ui";

// Admin console frame: verifies the admin session, enforces the forced
// password change, and renders the console's own navigation.

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

// Milestone 1 screens are live; the rest are listed so the roadmap is visible,
// but are clearly marked and not clickable until they exist.
const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, live: true, perm: "businesses.read" },
  { href: "/admin/businesses", label: "Businesses", icon: Building2, live: true, perm: "businesses.read" },
  { href: "/admin/store", label: "Insight Store", icon: ShoppingBag, live: true, perm: "marketplace.read" },
  { href: "/admin/email", label: "Email", icon: Mail, live: true, perm: "system.monitor" },
  { label: "Users", icon: Users, milestone: 2 },
  { label: "Branches", icon: GitBranch, milestone: 2 },
  { label: "Administrators", icon: ShieldCheck, milestone: 2 },
  { label: "Audit logs", icon: ScrollText, milestone: 2 },
  { label: "Analytics", icon: LineChart, milestone: 2 },
  { label: "Features", icon: Flag, milestone: 2 },
  { label: "Monitoring", icon: Activity, milestone: 3 },
  { label: "Synchronization", icon: RefreshCw, milestone: 3 },
  { label: "Support", icon: LifeBuoy, milestone: 3 },
  { label: "Storage", icon: HardDrive, milestone: 3 },
  { label: "Notifications", icon: Bell, milestone: 3 },
  { label: "Security", icon: Lock, milestone: 3 },
  { label: "Settings", icon: Settings, milestone: 3 },
];

function PasswordChange({ t, onDone }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.newPassword !== form.confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body?.error ?? "Could not change the password.");
      onDone();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };
  const field = (key, label, auto) => (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={`pw-${key}`} style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 5 }}>{label}</label>
      <input id={`pw-${key}`} type="password" autoComplete={auto} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={inputStyle(t)} />
    </div>
  );
  return (
    <div style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>
      <Card t={t} title="Set a new password">
        <p style={{ fontSize: 13, color: t.muted, marginTop: 0 }}>
          You're signed in with a temporary password. Choose a new one (at least 12 characters, with a letter and a number) to continue.
        </p>
        <form onSubmit={submit}>
          {field("currentPassword", "Temporary password", "current-password")}
          {field("newPassword", "New password", "new-password")}
          {field("confirm", "Confirm new password", "new-password")}
          {error && <div style={{ marginBottom: 12 }}><Notice t={t}>{error}</Notice></div>}
          <Button t={t} kind="primary" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Saving…" : "Save password"}</Button>
        </form>
      </Card>
    </div>
  );
}

export default function AdminShell({ active, title, subtitle, children }) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [me, setMe] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [navOpen, setNavOpen] = useState(false);
  const t = useMemo(() => (dark ? ADMIN_THEMES.dark : ADMIN_THEMES.light), [dark]);

  useEffect(() => {
    try { setDark(localStorage.getItem("insight_admin_theme") === "dark"); } catch {}
  }, []);
  const toggleTheme = () => {
    setDark((d) => {
      try { localStorage.setItem("insight_admin_theme", d ? "light" : "dark"); } catch {}
      return !d;
    });
  };

  const loadMe = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/auth/me");
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) return setState("error");
      setMe(await res.json());
      setState("ready");
    } catch {
      setState("error");
    }
  }, [router]);
  useEffect(() => { loadMe(); }, [loadMe]);

  const logout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/login");
  };

  const shellStyle = { minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };

  if (state === "loading") return <div style={{ ...shellStyle, padding: 32, fontSize: 14, color: t.muted }}>Checking your administrator session…</div>;
  if (state === "error") {
    return (
      <div style={{ ...shellStyle, padding: 32 }}>
        <Notice t={t}>Couldn't reach the server to verify your session.</Notice>
        <div style={{ marginTop: 12 }}><Button t={t} onClick={loadMe}>Try again</Button></div>
      </div>
    );
  }
  if (me.admin.mustChangePassword) {
    return <div style={shellStyle}><PasswordChange t={t} onDone={loadMe} /></div>;
  }

  const nav = (
    <nav aria-label="Admin" style={{ padding: "10px 8px", overflowY: "auto", flex: 1 }}>
      {NAV.filter((n) => !n.perm || me.permissions.includes(n.perm)).map((n) => {
        const Icon = n.icon;
        const isActive = n.href && active === n.href;
        const common = { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 6, fontSize: 13.5, marginBottom: 2, textDecoration: "none" };
        if (!n.live) {
          return (
            <div key={n.label} title={`Planned for milestone ${n.milestone}`} style={{ ...common, color: "rgba(209,213,219,0.4)", cursor: "default" }}>
              <Icon size={16} /> <span style={{ flex: 1 }}>{n.label}</span>
              <span style={{ fontSize: 10, border: "1px solid rgba(209,213,219,0.25)", borderRadius: 3, padding: "0 4px" }}>M{n.milestone}</span>
            </div>
          );
        }
        return (
          <a key={n.href} href={n.href} aria-current={isActive ? "page" : undefined}
            style={{ ...common, color: isActive ? "#fff" : t.navText, background: isActive ? t.navActive : "transparent", fontWeight: isActive ? 600 : 500, borderLeft: isActive ? `3px solid ${t.accent}` : "3px solid transparent" }}>
            <Icon size={16} /> {n.label}
          </a>
        );
      })}
    </nav>
  );

  return (
    <AdminContext.Provider value={{ me, t, dark }}>
      <div style={{ ...shellStyle, display: "flex" }}>
        <style>{`@media (max-width: 860px){ .adm-side{ display:none !important } .adm-menu{ display:flex !important } } .adm-main a{ color:${t.accent} }`}</style>
        <aside className="adm-side" style={{ width: 236, background: t.nav, color: t.navText, display: "flex", flexDirection: "column", flexShrink: 0, minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start", maxHeight: "100vh" }}>
          <div style={{ padding: "18px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#fff" }}>Insight Platform</div>
            <div style={{ fontSize: 11, color: "rgba(209,213,219,0.6)", marginTop: 2 }}>9DEVs administration</div>
          </div>
          {nav}
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "rgba(209,213,219,0.55)" }}>
            Built by <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 600 }}>9DEVs</a>
          </div>
        </aside>

        {navOpen && (
          <div role="dialog" aria-label="Navigation" style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex" }}>
            <div style={{ width: 260, background: t.nav, color: t.navText, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, color: "#fff", fontWeight: 700 }}>
                Insight Platform
                <button aria-label="Close navigation" onClick={() => setNavOpen(false)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}><X size={18} /></button>
              </div>
              {nav}
            </div>
            <div style={{ flex: 1, background: "rgba(0,0,0,0.45)" }} onClick={() => setNavOpen(false)} />
          </div>
        )}

        <div className="adm-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: t.surface, borderBottom: `1px solid ${t.border}` }}>
            <button className="adm-menu" aria-label="Open navigation" onClick={() => setNavOpen(true)}
              style={{ display: "none", background: "transparent", border: `1px solid ${t.border}`, borderRadius: 6, padding: 6, color: t.text, cursor: "pointer" }}>
              <Menu size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 17, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
              {subtitle && <div style={{ fontSize: 12.5, color: t.muted, marginTop: 1 }}>{subtitle}</div>}
            </div>
            <div style={{ textAlign: "right", fontSize: 12, lineHeight: 1.3 }} className="adm-who">
              <div style={{ fontWeight: 600 }}>{me.admin.name}</div>
              <div style={{ color: t.muted }}>{me.admin.roleLabel}</div>
            </div>
            <NotificationBell endpoint="/api/admin/notifications" dark={dark} theme={{ surface: t.surface, border: t.border, text: t.text, textMuted: t.muted }} />
            <button onClick={toggleTheme} aria-label="Toggle theme" style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 6, padding: 7, color: t.text, cursor: "pointer", display: "flex" }}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={logout} aria-label="Sign out" title="Sign out" style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 6, padding: 7, color: t.text, cursor: "pointer", display: "flex" }}>
              <LogOut size={16} />
            </button>
          </header>
          <main style={{ padding: 20, flex: 1 }}>{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
