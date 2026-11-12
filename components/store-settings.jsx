"use client";

import React, { useCallback, useEffect, useState } from "react";
import { applicationProblems, conditionalDocuments, isGhana, missingDocuments, APPROVAL_WINDOW, FIELD_NAMES } from "../lib/store/application-rules";
import { Boxes, Store, ShoppingBag, ShoppingCart, Upload, FileText, Trash2, Check, Clock, AlertTriangle, ExternalLink } from "lucide-react";

// Settings → Business Configuration: the Package selector and the Insight
// Store seller application. Both talk to server routes that enforce the real
// rules (owner-only package changes, approval before selling); this UI only
// presents them.

const PACKAGES = [
  { key: "FULL", title: "Full", text: "Inventory, Point of Sale, sales management and Insight Store selling.", Icon: Store, pos: true, store: true },
  { key: "INVENTORY_ONLY", title: "Inventory Only", text: "Standalone inventory management. No POS, sales management or Insight Store.", Icon: Boxes, pos: false, store: false },
  { key: "STORE_INVENTORY", title: "Store and Inventory", text: "Inventory plus selling on Insight Store. No POS. Requires seller approval.", Icon: ShoppingBag, pos: false, store: true },
  { key: "POS_INVENTORY", title: "POS and Inventory", text: "Inventory, Point of Sale and sales management. No Insight Store.", Icon: ShoppingCart, pos: true, store: false },
];
const POS_FEATURES = ["Point of Sale and checkout", "Sales history, voids and refunds", "Customers and customer credit", "Expenses", "Profit and loss reporting", "Sales analytics and cashier shifts"];
const STORE_FEATURES = ["Insight Store selling: marketplace listings and customer orders"];
const pkg = (k) => PACKAGES.find((p) => p.key === k);

function features(p) {
  return [...(p?.pos ? POS_FEATURES : []), ...(p?.store ? STORE_FEATURES : [])];
}

function Notice({ ok, tone, children, theme, dark }) {
  const color = tone === "warn" ? "#B7791F" : ok ? "#2E7D32" : "#B3261E";
  const bg = tone === "warn" ? (dark ? "#3A2E15" : "#FFF7E6") : ok ? (dark ? "#173C26" : "#E7F5EA") : (dark ? "#3A1D1B" : "#FBE9E7");
  return <div role="status" style={{ marginTop: 14, fontSize: 13, padding: "10px 12px", borderRadius: 6, color: tone === "warn" ? theme.text : color, background: bg, borderLeft: `3px solid ${color}` }}>{children}</div>;
}

function Btn({ children, onClick, disabled, kind = "primary", theme, type = "button", style }) {
  const base = { padding: "9px 16px", borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const kinds = {
    primary: { border: "none", background: "#2E7D32", color: "#fff" },
    ghost: { border: `1px solid ${theme.border}`, background: "transparent", color: theme.text },
    danger: { border: "1px solid #B3261E", background: "transparent", color: "#B3261E" },
  };
  return <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

// ---------------------------------------------------------------------------
// Package selector
// ---------------------------------------------------------------------------
export function PackageSettings({ theme, dark, card: Card, appMode, canChange, onChanged, onOpenStore }) {
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/business/mode");
      if (res.ok) setInfo(await res.json());
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const current = info?.mode ?? appMode;
  const waiting = info?.pendingMode ?? null;

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/business/mode", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: pending, confirm: true }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ ok: false, text: body?.error ?? "The package could not be changed." }); return; }
      await onChanged?.();
      await load();
      if (body.pending) setMessage({ ok: true, tone: "warn", text: body.note, pending: true });
      else setMessage({ ok: true, text: `Your business is now on the ${body.label} package.${body.note ? " " + body.note : ""}`, apply: !!body.note && /apply/i.test(body.note) });
    } catch {
      setMessage({ ok: false, text: "Couldn't reach the server. The package was not changed." });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const from = pkg(current);
  const to = pkg(pending);
  const losing = to ? features(from).filter((f) => !features(to).includes(f)) : [];
  const gaining = to ? features(to).filter((f) => !features(from).includes(f)) : [];
  const needsApproval = (pending === "STORE_INVENTORY" || pending === "FULL") && !info?.sellerStatus;

  return (
    <Card style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Package</div>
      <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 18 }}>Choose which parts of Insight your business uses. Changing package never deletes records.</div>

      <div role="radiogroup" aria-label="Package" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {PACKAGES.map(({ key, title, text, Icon }) => {
          const isCurrent = current === key;
          const isWaiting = waiting === key;
          return (
            <button key={key} role="radio" aria-checked={isCurrent} disabled={!canChange || isCurrent || busy || !current}
              onClick={() => { setMessage(null); setPending(key); }}
              style={{ textAlign: "left", padding: 16, borderRadius: 8, cursor: canChange && !isCurrent ? "pointer" : "default", border: `2px solid ${isCurrent ? "#2E7D32" : theme.border}`, background: isCurrent ? (dark ? "#173C26" : "#F0FFF0") : theme.surface, color: theme.text }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon size={17} color={isCurrent ? "#2E7D32" : theme.textMuted} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
                {isCurrent && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#2E7D32", border: "1px solid #2E7D32", borderRadius: 4, padding: "1px 6px" }}>Active</span>}
                {isWaiting && !isCurrent && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#B7791F", border: "1px solid #B7791F", borderRadius: 4, padding: "1px 6px" }}>Awaiting approval</span>}
              </div>
              <div style={{ fontSize: 12.5, color: theme.textMuted }}>{text}</div>
            </button>
          );
        })}
      </div>

      {!current && <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 14 }}>Loading current package…</div>}
      {current && !canChange && <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 14 }}>Only the business owner can change the package.</div>}
      {waiting && waiting !== current && (
        <Notice tone="warn" theme={theme} dark={dark}>
          {pkg(waiting)?.title} is waiting on your Insight Store seller application. It switches automatically once the application is approved.{" "}
          <button onClick={onOpenStore} style={{ border: "none", background: "transparent", color: "#2E7D32", fontWeight: 700, cursor: "pointer", padding: 0 }}>View application</button>
        </Notice>
      )}
      {message && (
        <Notice ok={message.ok} tone={message.tone} theme={theme} dark={dark}>
          {message.text}{" "}
          {(message.pending || message.apply) && <button onClick={onOpenStore} style={{ border: "none", background: "transparent", color: "#2E7D32", fontWeight: 700, cursor: "pointer", padding: 0 }}>{message.pending ? "Continue seller application" : "Go to Insight Store"}</button>}
        </Notice>
      )}

      {pending && (
        <div role="dialog" aria-modal="true" aria-labelledby="pkg-dialog-title" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30, padding: 16 }}>
          <div style={{ width: "min(480px, 100%)", background: theme.surface, color: theme.text, borderRadius: 10, border: `1px solid ${theme.border}`, padding: 22, maxHeight: "90vh", overflowY: "auto" }}>
            <div id="pkg-dialog-title" style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Switch to {to?.title}?</div>
            {needsApproval && (
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Store and Inventory needs approval from the Insight Store team. We'll open a seller application for you; your package stays as <b>{from?.title}</b> until it is approved.
              </div>
            )}
            {!needsApproval && losing.length > 0 && (
              <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>These will become unavailable for everyone in your business:</div>
                <ul style={{ fontSize: 13, margin: "0 0 10px 18px", padding: 0, lineHeight: 1.7 }}>{losing.map((f) => <li key={f}>{f}</li>)}</ul>
              </>
            )}
            {!needsApproval && gaining.length > 0 && (
              <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>These will become available:</div>
                <ul style={{ fontSize: 13, margin: "0 0 10px 18px", padding: 0, lineHeight: 1.7 }}>{gaining.map((f) => <li key={f}>{f}</li>)}</ul>
              </>
            )}
            {!needsApproval && to?.store && !info?.sellerStatus && (
              <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 10 }}>Selling on Insight Store also needs seller approval. You can apply from the Insight Store section after switching.</div>
            )}
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 16 }}>
              No records are deleted. Hidden modules keep their data and return when you switch to a package that includes them.
              {!needsApproval && from?.pos && !to?.pos ? " Sales queued offline on POS devices will not sync until POS is available again." : ""}
              {!needsApproval && from?.store && !to?.store ? " Your published Insight Store listings will be hidden from the marketplace." : ""}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Btn kind="ghost" theme={theme} onClick={() => setPending(null)} disabled={busy}>Cancel</Btn>
              <Btn theme={theme} onClick={confirm} disabled={busy}>{busy ? "Working…" : needsApproval ? "Start seller application" : `Switch to ${to?.title}`}</Btn>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Insight Store seller application
// ---------------------------------------------------------------------------
const STATUS = {
  DRAFT: { label: "Draft", color: "#5B6B63" },
  SUBMITTED: { label: "Submitted", color: "#1565C0" },
  UNDER_REVIEW: { label: "Under review", color: "#1565C0" },
  INFO_REQUIRED: { label: "Additional information required", color: "#B7791F" },
  APPROVED: { label: "Approved", color: "#2E7D32" },
  REJECTED: { label: "Rejected", color: "#B3261E" },
  WITHDRAWN: { label: "Withdrawn", color: "#5B6B63" },
};
const ACTION_LABEL = {
  CREATED: "Application started", SUBMITTED: "Submitted for review", RESUBMITTED: "Resubmitted with more information",
  REVIEW_STARTED: "Review started", INFO_REQUESTED: "More information requested", APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn",
};

function StatusPill({ status }) {
  const s = STATUS[status] ?? { label: status, color: "#5B6B63" };
  return <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color, border: `1px solid ${s.color}`, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{s.label}</span>;
}

const BUSINESS_TYPES = ["Sole proprietorship", "Partnership", "Limited liability company", "Cooperative", "Other"];
const PRODUCT_COUNTS = ["1–20", "21–100", "101–500", "More than 500"];

const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const fmtSize = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function StoreSettings({ theme, dark, card: Card, inputStyle, label, appMode }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({});
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [response, setResponse] = useState("");
  const [errors, setErrors] = useState({});
  const [countries, setCountries] = useState([]);
  const [geo, setGeo] = useState(null);
  const [otherRegion, setOtherRegion] = useState(false);
  const [otherCity, setOtherCity] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/seller/status");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.error ?? "Insight Store details could not be loaded."); return; }
      setState(body);
      if (body.application) setForm(body.application.data ?? {});
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    load();
    fetch("/api/store/public/categories").then((r) => (r.ok ? r.json() : null)).then((b) => b?.categories && setCategories(b.categories)).catch(() => {});
  }, [load]);

  // Country list once; regions and cities for the chosen country on demand.
  useEffect(() => {
    fetch("/geo/index.json").then((r) => (r.ok ? r.json() : [])).then(setCountries).catch(() => {});
  }, []);
  useEffect(() => {
    const entry = countries.find((c) => c.n === form.country);
    if (!entry) { setGeo(null); return; }
    let live = true;
    fetch(`/geo/${entry.f}.json`).then((r) => (r.ok ? r.json() : null)).then((g) => live && setGeo(g)).catch(() => live && setGeo(null));
    return () => { live = false; };
  }, [countries, form.country]);
  const regionNames = (geo?.regions ?? []).map((r) => r.n);
  const cityNames = (geo?.regions ?? []).find((r) => r.n === form.region)?.c ?? [];

  const app = state?.application;
  const editable = app && (app.status === "DRAFT" || app.status === "INFO_REQUIRED") && state?.canApply;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  async function call(name, url, init, success) {
    setBusy(name);
    setMessage(null);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ ok: false, text: body?.error ?? "Something went wrong." }); return null; }
      if (success) setMessage({ ok: true, text: success });
      await load();
      return body;
    } catch {
      setMessage({ ok: false, text: "Couldn't reach the server. Nothing was changed." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  const start = () => call("start", "/api/seller/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, "Your application has been started. Complete the form below and submit it for review.");
  const save = () => call("save", `/api/seller/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: cleanForm(form) }) }, "Draft saved.");
  async function submit() {
    // Check everything in the browser first so the applicant sees every problem at once.
    const data = cleanForm(form);
    const problems = applicationProblems(data);
    const docs = missingDocuments(data, (state.requiredDocuments ?? []).filter((d) => d.key !== "owner_id"), (app.documents ?? []).map((d) => d.docKey));
    if (docs.length) problems.docs = `Please upload: ${docs.join(", ")}.`;
    setErrors(problems);
    const keys = Object.keys(problems);
    if (keys.length) {
      setMessage({ ok: false, text: `Please fix ${keys.length} ${keys.length === 1 ? "item" : "items"} before submitting. ${keys.length === 1 ? "It is" : "They are"} marked in red.` });
      const first = keys.find((k) => k !== "docs") ?? "docs";
      setTimeout(() => document.getElementById(first === "docs" ? "sa-docs" : `sa-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
      return;
    }
    const saved = await call("submit", `/api/seller/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: cleanForm(form) }) });
    if (!saved) return;
    await call("submit", `/api/seller/applications/${app.id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) }, "Application submitted. The Insight Store team will review it and you'll be notified of the decision.");
    setResponse("");
  }
  const withdraw = () => {
    if (typeof window !== "undefined" && !window.confirm?.("Withdraw this application? You can apply again later.")) return;
    call("withdraw", `/api/seller/applications/${app.id}/withdraw`, { method: "POST" }, "Application withdrawn.");
  };
  async function upload(docKey, file) {
    if (!file) return;
    // Uploading reloads the application from the server, so save the answers first
    // or anything typed since the last save would be lost.
    const saved = await call("save", `/api/seller/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: cleanForm(form) }) });
    if (!saved) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("docKey", docKey);
    await call(`doc:${docKey}`, `/api/seller/applications/${app.id}/documents`, { method: "POST", body: fd }, `${file.name} uploaded.`);
  }
  const removeDoc = (id) => call(`del:${id}`, `/api/seller/applications/${app.id}/documents/${id}`, { method: "DELETE" }, "Document removed.");

  if (error) return <Card style={{ maxWidth: 760 }}><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Insight Store</div><Notice ok={false} theme={theme} dark={dark}>{error}</Notice><div style={{ marginTop: 12 }}><Btn kind="ghost" theme={theme} onClick={load}>Try again</Btn></div></Card>;
  if (!state) return <Card style={{ maxWidth: 760 }}><div style={{ fontSize: 13, color: theme.textMuted }}>Loading Insight Store…</div></Card>;

  const ghana = isGhana(form.country);
  const req = (props) => !props.optional;
  const errId = (k) => `sa-${k}-err`;
  const fieldLabel = (k, title, props) => (
    <label style={label} htmlFor={`sa-${k}`}>{title}{req(props) ? <span style={{ color: "#B3261E" }} aria-hidden="true"> *</span> : <span style={{ color: theme.textMuted, fontWeight: 500 }}> (optional)</span>}</label>
  );
  const fieldError = (k) => (errors[k] ? <div id={errId(k)} role="alert" style={{ color: "#B3261E", fontSize: 12, marginTop: 4 }}>{errors[k]}</div> : null);
  const inputBorder = (k) => (errors[k] ? { borderColor: "#B3261E" } : null);
  const clearErr = (k) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const checkOne = (k) => {
    const p = applicationProblems({ ...form, [k]: form[k] }, { forSubmit: false });
    setErrors((e) => { const n = { ...e }; if (p[k]) n[k] = p[k]; else delete n[k]; return n; });
  };

  const field = (k, title, props = {}) => {
    const isPhone = k === "phone" || k === "repPhone";
    const common = { id: `sa-${k}`, "aria-required": req(props), "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? errId(k) : undefined, disabled: !editable, style: { ...inputStyle, ...inputBorder(k) } };
    return (
      <div style={{ marginBottom: 14 }}>
        {fieldLabel(k, title, props)}
        {props.options ? (
          <select {...common} value={form[k] ?? ""} onChange={(e) => { set(k)(e); clearErr(k); }}>
            <option value="">Select…</option>
            {props.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : props.textarea ? (
          <textarea {...common} style={{ ...common.style, minHeight: 80, resize: "vertical" }} value={form[k] ?? ""} onChange={(e) => { set(k)(e); clearErr(k); }} maxLength={props.max ?? 2000} />
        ) : isPhone ? (
          <input {...common} type="tel" inputMode={ghana ? "numeric" : "tel"} autoComplete="tel" maxLength={ghana ? 10 : 20}
            placeholder={ghana ? "0241234567" : "+1 555 123 4567"} value={form[k] ?? ""}
            onChange={(e) => { setForm((f) => ({ ...f, [k]: ghana ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value })); clearErr(k); }}
            onBlur={() => checkOne(k)} />
        ) : (
          <input {...common} value={form[k] ?? ""} onChange={(e) => { set(k)(e); clearErr(k); }} type={props.type ?? "text"}
            autoComplete={props.type === "email" ? "email" : undefined} onBlur={props.type === "email" ? () => checkOne(k) : undefined} maxLength={props.max ?? 160} />
        )}
        {isPhone && ghana && !errors[k] && <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 4 }}>Ghana numbers: digits only, up to 10.</div>}
        {fieldError(k)}
      </div>
    );
  };

  // Country → region → city. Lists come from /geo; "Other" lets the applicant type
  // a place the list doesn't have, so nobody is blocked.
  const OTHER = "__other__";
  const place = (k, title, names, other, setOther, onPick) => {
    const value = other || (form[k] && !names.includes(form[k])) ? OTHER : (form[k] ?? "");
    return (
      <div style={{ marginBottom: 14 }}>
        {fieldLabel(k, title, {})}
        <select id={`sa-${k}`} aria-required="true" aria-invalid={!!errors[k]} style={{ ...inputStyle, ...inputBorder(k) }} disabled={!editable || (k !== "country" && !form.country)} value={value}
          onChange={(e) => {
            const v = e.target.value; clearErr(k);
            if (v === OTHER) { setOther(true); onPick(""); } else { setOther(false); onPick(v); }
          }}>
          <option value="">Select…</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
          {k !== "country" && <option value={OTHER}>Other (type it in)</option>}
        </select>
        {value === OTHER && (
          <input aria-label={`${title} (type it in)`} style={{ ...inputStyle, marginTop: 8, ...inputBorder(k) }} disabled={!editable} maxLength={80}
            placeholder={`Type your ${title.toLowerCase()}`} value={form[k] ?? ""} onChange={(e) => { setForm((f) => ({ ...f, [k]: e.target.value })); clearErr(k); }} />
        )}
        {fieldError(k)}
      </div>
    );
  };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 16px" };
  const h = (t) => <div style={{ fontSize: 13.5, fontWeight: 700, margin: "18px 0 10px", paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>{t}</div>;

  return (
    <div style={{ maxWidth: 760 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <ShoppingBag size={18} color="#2E7D32" />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Insight Store</div>
          {state.seller && <span style={{ marginLeft: "auto" }}><StatusPill status={state.seller.status === "ACTIVE" ? "APPROVED" : "REJECTED"} /></span>}
        </div>
        <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 6 }}>
          Insight Store is the 9DEVs marketplace where approved businesses list products from their Insight inventory and receive customer orders through WhatsApp.
        </div>

        {state.seller ? (
          <>
            <Notice ok={state.seller.status === "ACTIVE"} theme={theme} dark={dark}>
              {state.seller.status === "ACTIVE"
                ? "Your business is an approved Insight Store seller."
                : `Insight Store selling is suspended for your business${state.seller.suspendedReason ? `: ${state.seller.suspendedReason}` : "."}`}
            </Notice>
            {!state.package.includesStore && (
              <Notice tone="warn" theme={theme} dark={dark}>Your {state.package.label} package doesn't include Insight Store, so your listings are hidden. Switch to Full or Store and Inventory under Package to sell.</Notice>
            )}
            {state.canSell && (
              <div style={{ marginTop: 14 }}><a href="/seller" style={{ color: "#2E7D32", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>Open the seller area <ExternalLink size={13} /></a></div>
            )}
          </>
        ) : !app || ["REJECTED", "WITHDRAWN", "APPROVED"].includes(app.status) ? (
          <>
            {app?.status === "REJECTED" && (
              <Notice ok={false} theme={theme} dark={dark}>Your last application ({app.reference}) was not approved{app.decisionReason ? `: ${app.decisionReason}` : "."} You can apply again.</Notice>
            )}
            <ul style={{ fontSize: 13, margin: "12px 0 14px 18px", padding: 0, lineHeight: 1.7 }}>
              <li>Apply once; the Insight Store team reviews your business and documents. Review takes {state.approvalWindow ?? APPROVAL_WINDOW}.</li>
              <li>After approval, choose which inventory products to publish. Each listing is reviewed before it goes live.</li>
              <li>Stock comes from your Insight inventory, so nothing is counted twice.</li>
              <li>Customers order through WhatsApp; you confirm, agree payment and fulfil the order yourself.</li>
            </ul>
            {!state.package.includesStore && (
              <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 12 }}>Selling also needs a package that includes Insight Store (Full, or Store and Inventory). You can apply now and switch package later.</div>
            )}
            {state.canApply ? (
              <Btn theme={theme} onClick={start} disabled={busy === "start"}>{busy === "start" ? "Starting…" : app ? "Start a new application" : "Apply to sell on Insight Store"}</Btn>
            ) : (
              <div style={{ fontSize: 12.5, color: theme.textMuted }}>Only the business owner can apply to sell on Insight Store.</div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <span style={{ fontSize: 13 }}>Application <b>{app.reference}</b></span>
              <StatusPill status={app.status} />
              {state.pendingPackage && <span style={{ fontSize: 12, color: theme.textMuted }}>· {state.pendingPackage.label} package applies on approval</span>}
            </div>
            {app.status === "INFO_REQUIRED" && app.infoRequest && (
              <Notice tone="warn" theme={theme} dark={dark}><b>The Insight Store team asked for more information:</b><div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{app.infoRequest}</div></Notice>
            )}
            {(app.status === "SUBMITTED" || app.status === "UNDER_REVIEW") && (
              <Notice ok theme={theme} dark={dark}>Submitted {fmtDate(app.submittedAt)}. You'll get a notification when the review is complete.</Notice>
            )}
          </>
        )}
        {message && <Notice ok={message.ok} theme={theme} dark={dark}>{message.text}</Notice>}
      </Card>

      {app && ["DRAFT", "INFO_REQUIRED", "SUBMITTED", "UNDER_REVIEW"].includes(app.status) && !state.seller && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>Seller application</div>
          {!editable && <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 4 }}>{state.canApply ? "This application is with the Insight Store team and can't be edited right now." : "Only the business owner can edit the application."}</div>}

          <div style={{ fontSize: 12.5, color: theme.textMuted, margin: "6px 0 0" }}>Fields marked <span style={{ color: "#B3261E" }}>*</span> are required. Only the registration number is optional.</div>
          <div role="note" style={{ marginTop: 10, fontSize: 12.5, padding: "9px 11px", borderRadius: 6, background: dark ? "#3A2E15" : "#FFF7E6", borderLeft: "3px solid #B7791F", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Clock size={14} style={{ marginTop: 1, flexShrink: 0 }} /> <span>Review takes {state.approvalWindow ?? APPROVAL_WINDOW} after you submit. We'll notify you of the decision.</span>
          </div>

          {h("Business details")}
          <div style={grid}>
            {field("registeredName", "Registered business name")}
            {field("tradingName", "Trading name")}
            {field("registrationNumber", "Registration number", { optional: true, max: 80 })}
            {field("businessType", "Business type", { options: BUSINESS_TYPES })}
          </div>
          {field("description", "Business description", { textarea: true })}

          {h("Location and contact")}
          {field("address", "Business address", { max: 300 })}
          <div style={grid}>
            {place("country", "Country", countries.map((c) => c.n), false, () => {}, (v) => { setOtherRegion(false); setOtherCity(false); setForm((f) => ({ ...f, country: v, region: "", city: "" })); })}
            {place("region", "Region", regionNames, otherRegion, setOtherRegion, (v) => { setOtherCity(false); setForm((f) => ({ ...f, region: v, city: "" })); })}
            {place("city", "City", cityNames, otherCity, setOtherCity, (v) => setForm((f) => ({ ...f, city: v })))}
            {field("phone", "Contact phone", { type: "tel" })}
            {field("email", "Business email", { type: "email" })}
          </div>

          {h("Authorised representative")}
          <div style={grid}>
            {field("repName", "Full name", { max: 120 })}
            {field("repPosition", "Position", { max: 80 })}
            {field("repPhone", "Contact number", { type: "tel" })}
            {field("repEmail", "Email", { type: "email" })}
          </div>

          {h("Products and fulfilment")}
          <div style={{ marginBottom: 14 }} id="sa-categories">
            <span style={label}>Product categories<span style={{ color: "#B3261E" }} aria-hidden="true"> *</span></span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(categories.length ? categories.map((c) => c.name) : ["General"]).map((name) => {
                const on = (form.categories ?? []).includes(name);
                return (
                  <button key={name} type="button" disabled={!editable} aria-pressed={on}
                    onClick={() => { clearErr("categories"); setForm((f) => ({ ...f, categories: on ? (f.categories ?? []).filter((x) => x !== name) : [...(f.categories ?? []), name] })); }}
                    style={{ fontSize: 12.5, padding: "5px 10px", borderRadius: 14, cursor: editable ? "pointer" : "default", border: `1px solid ${on ? "#2E7D32" : errors.categories ? "#B3261E" : theme.border}`, background: on ? (dark ? "#173C26" : "#E7F5EA") : "transparent", color: on ? "#2E7D32" : theme.text, fontWeight: on ? 700 : 500 }}>
                    {on && <Check size={11} style={{ marginRight: 4, verticalAlign: -1 }} />}{name}
                  </button>
                );
              })}
            </div>
            {fieldError("categories")}
          </div>
          <div style={grid}>
            {field("productCount", "Approximate number of products", { options: PRODUCT_COUNTS })}
            {field("onlinePresence", "Website or social pages", { max: 300 })}
          </div>
          {field("fulfilment", "How will you fulfil orders?", { textarea: true, max: 300 })}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 6 }}>
            {[["physicalPresence", "We have a physical shop"], ["offersCollection", "Customers can collect"], ["offersDelivery", "We deliver"]].map(([k, t]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={!!form[k]} onChange={(e) => { set(k)(e); if (k === "physicalPresence") { clearErr("shopAddress"); setErrors((x) => ({ ...x, docs: undefined })); } }} disabled={!editable} /> {t}
              </label>
            ))}
          </div>
          {form.physicalPresence && (
            <div style={{ marginTop: 10 }}>
              {field("shopAddress", "Physical shop address", { max: 300 })}
              <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: -6 }}>A photo of your Ghana Card or Voter's ID is also required below.</div>
            </div>
          )}

          {h("Supporting documents")}
          <div id="sa-docs">{errors.docs && <div role="alert" style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 8 }}>{errors.docs}</div>}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 10 }}>PDF, PNG or JPEG, up to 5 MB each. Documents are stored privately and only the Insight Store review team can open them.</div>
          {[...(state.requiredDocuments ?? []).filter((d) => d.key !== "owner_id"), ...conditionalDocuments(form), { key: "other", label: "Other supporting document", required: false }].map((d) => {
            const docs = (app.documents ?? []).filter((x) => x.docKey === d.key);
            return (
              <div key={d.key} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <FileText size={15} color={theme.textMuted} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
                  <span style={{ fontSize: 11.5, color: d.required ? "#B7791F" : theme.textMuted }}>{d.required ? "Required" : "Optional"}</span>
                  {editable && (
                    <label style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: "#2E7D32", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Upload size={13} /> {busy === `doc:${d.key}` ? "Uploading…" : "Upload"}
                      <input type="file" accept="application/pdf,image/png,image/jpeg" style={{ display: "none" }} disabled={!!busy}
                        onChange={(e) => { upload(d.key, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
                {docs.map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 8, paddingLeft: 23 }}>
                    <Check size={13} color="#2E7D32" />
                    <a href={`/api/seller/applications/${app.id}/documents/${doc.id}`} style={{ color: theme.text }}>{doc.fileName}</a>
                    <span style={{ color: theme.textMuted }}>{fmtSize(doc.sizeBytes)}</span>
                    {editable && (
                      <button aria-label={`Remove ${doc.fileName}`} onClick={() => removeDoc(doc.id)} disabled={!!busy} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#B3261E", cursor: "pointer", display: "flex" }}><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {editable && app.status === "INFO_REQUIRED" && (
            <div style={{ marginTop: 10 }}>
              <label style={label} htmlFor="sa-response">Your response to the review team</label>
              <textarea id="sa-response" style={{ ...inputStyle, minHeight: 70 }} value={response} onChange={(e) => setResponse(e.target.value)} maxLength={2000} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            {editable && <Btn theme={theme} onClick={submit} disabled={!!busy}>{busy === "submit" ? "Submitting…" : app.status === "INFO_REQUIRED" ? "Resubmit for review" : "Submit for review"}</Btn>}
            {editable && <Btn kind="ghost" theme={theme} onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save draft"}</Btn>}
            {state.canApply && <Btn kind="danger" theme={theme} onClick={withdraw} disabled={!!busy} style={{ marginLeft: "auto" }}>Withdraw application</Btn>}
          </div>
        </Card>
      )}

      {(app?.events?.length > 0 || state.history?.length > 1) && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>Application history</div>
          {(app?.events ?? []).map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "7px 0", borderBottom: `1px solid ${theme.border}` }}>
              <Clock size={13} color={theme.textMuted} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div><b>{ACTION_LABEL[e.action] ?? e.action}</b>{e.actorLabel ? <span style={{ color: theme.textMuted }}> · {e.actorType === "PLATFORM_ADMIN" ? "Insight Store team" : e.actorLabel}</span> : null}</div>
                {e.note && <div style={{ color: theme.textMuted, whiteSpace: "pre-wrap", marginTop: 2 }}>{e.note}</div>}
              </div>
              <span style={{ color: theme.textMuted, whiteSpace: "nowrap" }}>{fmtDate(e.createdAt)}</span>
            </div>
          ))}
          {state.history?.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Earlier applications</div>
              {state.history.filter((h) => h.id !== app?.id).map((h) => (
                <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, padding: "4px 0" }}>
                  <span>{h.reference}</span><StatusPill status={h.status} />
                  <span style={{ color: theme.textMuted }}>{fmtDate(h.decidedAt ?? h.submittedAt ?? h.createdAt)}</span>
                  {h.decisionReason && <span style={{ color: theme.textMuted }}>· {h.decisionReason}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {!state.canSell && state.seller && state.seller.status !== "ACTIVE" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: theme.textMuted, marginTop: 12 }}><AlertTriangle size={13} /> Contact 9DEVs support if you believe this suspension is a mistake.</div>
      )}
    </div>
  );
}

function cleanForm(f) {
  const allowed = ["registeredName", "tradingName", "registrationNumber", "businessType", "description", "address", "city", "region", "country", "phone", "email", "repName", "repPosition", "repPhone", "repEmail", "categories", "productCount", "physicalPresence", "onlinePresence", "fulfilment", "offersDelivery", "offersCollection", "shopAddress"];
  const out = {};
  for (const k of allowed) if (f[k] !== undefined && f[k] !== null) out[k] = f[k];
  return out;
}
