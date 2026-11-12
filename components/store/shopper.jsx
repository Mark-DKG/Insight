"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// Insight Store shopper accounts: the "guest or account" prompt, the header
// account menu and the account page. These only ever mount inside /store —
// the landing page and the business app never load this file.

const API = "/api/store/public/account";
export const SHOPPER_EVENT = "insight-shopper";
const OPEN_EVENT = "insight-shopper-open";
const CHOICE_KEY = "ist-visitor-choice";
const CHOICE_DAYS = 30;

async function call(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const announce = (shopper) => window.dispatchEvent(new CustomEvent(SHOPPER_EVENT, { detail: shopper }));

/** Remembered "continue as guest", good for 30 days. Storage may be unavailable. */
function guestChosen() {
  try {
    const v = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null");
    return !!v && v.choice === "guest" && Date.now() - v.at < CHOICE_DAYS * 86400_000;
  } catch { return false; }
}
function rememberGuest() {
  try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ choice: "guest", at: Date.now() })); } catch {}
}

/** Current shopper (null when signed out), kept in sync across components. */
export function useShopper() {
  const [state, setState] = useState({ shopper: undefined });
  useEffect(() => {
    let live = true;
    fetch(`${API}/me`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { shopper: null }))
      .then((b) => live && setState({ shopper: b.shopper ?? null }))
      .catch(() => live && setState({ shopper: null }));
    const on = (e) => setState({ shopper: e.detail ?? null });
    window.addEventListener(SHOPPER_EVENT, on);
    return () => { live = false; window.removeEventListener(SHOPPER_EVENT, on); };
  }, []);
  return state.shopper; // undefined = still loading
}

export function openAccountPrompt(mode = "signin") {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { mode } }));
}

/* ------------------------------------------------------------- sign in / up */

export function AuthPanel({ mode: initial = "create", onDone, onBack }) {
  const [mode, setMode] = useState(initial);
  const [f, setF] = useState({ name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const create = mode === "create";

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { ok, data } = create
        ? await call("/register", "POST", { name: f.name, email: f.email, password: f.password, phone: f.phone })
        : await call("/login", "POST", { email: f.email, password: f.password });
      if (!ok) { setError(data.error ?? "Something went wrong. Please try again."); return; }
      announce(data.shopper);
      onDone?.(data.shopper);
    } catch { setError("You're offline. Connect and try again."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="st-auth" noValidate={false}>
      {create && (
        <div className="st-field"><label className="st-label" htmlFor="a-name">Full name</label>
          <input id="a-name" className="st-input" required maxLength={120} autoComplete="name" value={f.name} onChange={set("name")} /></div>
      )}
      <div className="st-field"><label className="st-label" htmlFor="a-email">Email</label>
        <input id="a-email" className="st-input" type="email" required maxLength={160} autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} /></div>
      <div className="st-field"><label className="st-label" htmlFor="a-pass">Password</label>
        <input id="a-pass" className="st-input" type="password" required minLength={create ? 8 : 1} maxLength={128} autoComplete={create ? "new-password" : "current-password"} value={f.password} onChange={set("password")} />
        {create && <div className="st-mu" style={{ fontSize: 12, marginTop: 4 }}>At least 8 characters.</div>}</div>
      {create && (
        <div className="st-field"><label className="st-label" htmlFor="a-phone">Phone (WhatsApp) <span className="st-mu" style={{ fontWeight: 500 }}>(optional)</span></label>
          <input id="a-phone" className="st-input" inputMode="tel" maxLength={40} placeholder="024 123 4567" autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
      )}
      {error && <div className="st-err" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      <button className="st-btn" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Please wait…" : create ? "Create account" : "Sign in"}
      </button>
      <div className="st-auth-sw">
        {create ? "Already have an account?" : "New to Insight Store?"}{" "}
        <button type="button" className="st-link" onClick={() => { setMode(create ? "signin" : "create"); setError(null); }}>
          {create ? "Sign in" : "Create an account"}
        </button>
      </div>
      {onBack && <button type="button" className="st-link st-auth-back" onClick={onBack}>← Back</button>}
    </form>
  );
}

/* ------------------------------------------------- the first-visit prompt */

// Shown once to a visitor who is neither signed in nor a remembered guest.
// Lives in the store layout, so it can only ever appear on /store pages.
// Customer status pages (opened from a WhatsApp link) and the account page
// itself never trigger it.
export function ShopperGate() {
  const shopper = useShopper();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("choose"); // choose | create | signin
  const box = useRef(null);
  const returnFocus = useRef(null);

  const quiet = () => /^\/store\/(orders\/|account)/.test(window.location.pathname);

  // First visit: ask, once we know the visitor isn't already signed in.
  useEffect(() => {
    if (shopper === undefined) return;
    if (shopper) { setOpen(false); return; }
    if (quiet() || guestChosen()) return;
    returnFocus.current = document.activeElement;
    setView("choose"); setOpen(true);
  }, [shopper]);

  // Header "Sign in" button opens the same dialog on demand.
  useEffect(() => {
    const on = (e) => { returnFocus.current = document.activeElement; setView(e.detail?.mode === "create" ? "create" : "signin"); setOpen(true); };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);

  const asGuest = useCallback(() => { rememberGuest(); setOpen(false); }, []);

  // Escape = continue as guest. Keep Tab inside the dialog. Lock page scroll.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = box.current?.querySelector("button, input");
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); asGuest(); }
      if (e.key !== "Tab" || !box.current) return;
      const els = [...box.current.querySelectorAll("button, input, a[href]")].filter((el) => !el.disabled);
      if (!els.length) return;
      const a = els[0], z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      returnFocus.current?.focus?.();
    };
  }, [open, view, asGuest]);

  if (!open) return null;
  return (
    <div className="st-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) asGuest(); }}>
      <div className="st-dialog" role="dialog" aria-modal="true" aria-labelledby="st-gate-h" ref={box}>
        {view === "choose" ? (
          <>
            <h2 id="st-gate-h" className="st-dialog-h">Welcome to Insight Store</h2>
            <p className="st-mu st-dialog-p">Browse and order as a guest, or create an account to save your details and track your orders.</p>
            <div className="st-dialog-actions">
              <button className="st-btn" onClick={() => setView("create")}>Create an account</button>
              <button className="st-btn ghost" onClick={asGuest}>Continue as guest</button>
            </div>
            <div className="st-auth-sw">Already have an account? <button className="st-link" onClick={() => setView("signin")}>Sign in</button></div>
          </>
        ) : (
          <>
            <h2 id="st-gate-h" className="st-dialog-h">{view === "create" ? "Create your account" : "Sign in"}</h2>
            <AuthPanel key={view} mode={view} onDone={() => setOpen(false)} onBack={() => setView("choose")} />
            <div className="st-dialog-foot"><button className="st-link" onClick={asGuest}>Continue as guest instead</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- header account */

export function AccountMenu() {
  const shopper = useShopper();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function signOut() {
    await call("/logout", "POST").catch(() => {});
    announce(null); setOpen(false);
    if (/^\/store\/account/.test(window.location.pathname)) window.location.href = "/store";
  }

  if (shopper === undefined) return <span className="st-acct-hold" aria-hidden="true" />;
  if (!shopper) return <button className="st-cart st-acct-btn" onClick={() => openAccountPrompt("signin")}>Sign in</button>;
  const first = shopper.name.split(" ")[0];
  return (
    <div className="st-acct" ref={ref}>
      <button className="st-cart st-acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="st-avatar" aria-hidden="true">{first.slice(0, 1).toUpperCase()}</span>
        <span className="st-acct-name">{first}</span>
      </button>
      {open && (
        <div className="st-menu" role="menu">
          <div className="st-menu-id"><b>{shopper.name}</b><span>{shopper.email}</span></div>
          <a role="menuitem" href="/store/account">My account and orders</a>
          <button role="menuitem" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ account page */

const money = (n, c) => `${c} ${Number(n).toFixed(2)}`;

export function AccountPage() {
  const shopper = useShopper();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    if (!shopper) return;
    call("/orders").then(({ ok, data }) => setOrders(ok ? data.orders : []));
  }, [shopper]);

  if (shopper === undefined) return <div className="st-mu">Loading…</div>;
  if (!shopper) {
    return (
      <div className="st-panel" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h2 className="st-dialog-h" style={{ marginTop: 0 }}>Sign in to your account</h2>
        <AuthPanel mode="signin" onDone={() => {}} />
      </div>
    );
  }
  return (
    <div className="st-account">
      <ProfileCard shopper={shopper} />
      <div className="st-panel">
        <div className="st-card-h">Your orders</div>
        {orders === null ? <div className="st-mu">Loading…</div>
          : orders.length === 0 ? <div className="st-mu">No orders yet. Orders you place while signed in appear here.</div>
          : orders.map((o) => (
            <a key={o.reference} href={o.path} className="st-orow">
              <span><b>{o.reference}</b><span className="st-mu"> · {o.seller}</span><br /><span className="st-mu" style={{ fontSize: 12.5 }}>{new Date(o.createdAt).toLocaleDateString()} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · {money(o.subtotal, o.currency)}</span></span>
              <span className="st-pill">{o.statusLabel}</span>
            </a>
          ))}
      </div>
      <PasswordCard />
      <DeleteCard />
    </div>
  );
}

function ProfileCard({ shopper }) {
  const [f, setF] = useState({ name: shopper.name, phone: shopper.phone ?? "", defaultAddress: shopper.defaultAddress ?? "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { ok, data } = await call("/profile", "PATCH", f).catch(() => ({ ok: false, data: { error: "You're offline." } }));
    if (ok) { announce(data.shopper); setMsg({ ok: true, t: "Saved." }); } else setMsg({ ok: false, t: data.error ?? "Couldn't save." });
    setBusy(false);
  }
  return (
    <form className="st-panel" onSubmit={save}>
      <div className="st-card-h">Your details</div>
      <div className="st-field"><label className="st-label">Email</label><input className="st-input" value={shopper.email} disabled /></div>
      <div className="st-field"><label className="st-label" htmlFor="p-name">Full name</label><input id="p-name" className="st-input" required maxLength={120} value={f.name} onChange={set("name")} /></div>
      <div className="st-field"><label className="st-label" htmlFor="p-phone">Phone (WhatsApp)</label><input id="p-phone" className="st-input" inputMode="tel" maxLength={40} value={f.phone} onChange={set("phone")} /></div>
      <div className="st-field"><label className="st-label" htmlFor="p-addr">Delivery address</label><textarea id="p-addr" className="st-input" rows={2} maxLength={500} value={f.defaultAddress} onChange={set("defaultAddress")} /></div>
      <div className="st-mu" style={{ fontSize: 12.5, marginBottom: 12 }}>Used to fill in checkout for you. You can change it on any order.</div>
      {msg && <div className={msg.ok ? "st-ok" : "st-err"} role="status" style={{ marginBottom: 12 }}>{msg.t}</div>}
      <button className="st-btn" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
    </form>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { ok, data } = await call("/password", "POST", f).catch(() => ({ ok: false, data: { error: "You're offline." } }));
    if (ok) { setMsg({ ok: true, t: "Password changed. Other devices have been signed out." }); setF({ currentPassword: "", newPassword: "" }); }
    else setMsg({ ok: false, t: data.error ?? "Couldn't change your password." });
    setBusy(false);
  }
  return (
    <form className="st-panel" onSubmit={go}>
      <div className="st-card-h">Change password</div>
      <div className="st-field"><label className="st-label" htmlFor="pw-c">Current password</label><input id="pw-c" className="st-input" type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></div>
      <div className="st-field"><label className="st-label" htmlFor="pw-n">New password</label><input id="pw-n" className="st-input" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></div>
      {msg && <div className={msg.ok ? "st-ok" : "st-err"} role="status" style={{ marginBottom: 12 }}>{msg.t}</div>}
      <button className="st-btn ghost" disabled={busy}>{busy ? "Updating…" : "Change password"}</button>
    </form>
  );
}

function DeleteCard() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  async function del(e) {
    e.preventDefault(); setErr(null);
    const { ok, data } = await call("/profile", "DELETE", { password: pw }).catch(() => ({ ok: false, data: { error: "You're offline." } }));
    if (ok) { announce(null); window.location.href = "/store"; } else setErr(data.error ?? "Couldn't delete your account.");
  }
  return (
    <div className="st-panel">
      <div className="st-card-h">Delete account</div>
      <p className="st-mu" style={{ margin: "0 0 12px" }}>Removes your account and saved details. Orders you've already placed stay with their sellers.</p>
      {!open ? <button className="st-btn ghost" onClick={() => setOpen(true)}>Delete my account…</button> : (
        <form onSubmit={del}>
          <div className="st-field"><label className="st-label" htmlFor="del-pw">Enter your password to confirm</label><input id="del-pw" className="st-input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          {err && <div className="st-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="st-btn" style={{ background: "#B3261E" }}>Permanently delete</button>{" "}
          <button type="button" className="st-btn ghost" onClick={() => { setOpen(false); setPw(""); setErr(null); }}>Cancel</button>
        </form>
      )}
    </div>
  );
}
