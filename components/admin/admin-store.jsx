"use client";

import React, { useCallback, useEffect, useState } from "react";
import AdminShell, { useAdmin } from "./admin-shell";
import { Badge, Button, Card, ConfirmDialog, Notice, Stat, fmtDateTime, fmtMoney, fmtNum, inputStyle } from "./ui";

// Super Admin → Insight Store: seller applications, sellers, listing
// moderation, order oversight and marketplace settings. Every change goes
// through /api/admin/store/* which checks marketplace.* permissions and
// writes the platform audit log.

const TABS = [
  ["overview", "Overview"], ["applications", "Applications"], ["sellers", "Sellers"], ["listings", "Listings"], ["orders", "Orders"], ["settings", "Settings"],
];
const APP_TONE = { SUBMITTED: "warn", UNDER_REVIEW: "warn", INFO_REQUIRED: "neutral", APPROVED: "good", REJECTED: "bad", WITHDRAWN: "neutral", DRAFT: "neutral" };
const APP_LABEL = { DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", INFO_REQUIRED: "Info required", APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" };
const LIST_LABEL = { DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", APPROVED: "Approved", PUBLISHED: "Live", REJECTED: "Rejected", UNPUBLISHED: "Unpublished" };
const LIST_TONE = { SUBMITTED: "warn", UNDER_REVIEW: "warn", PUBLISHED: "good", REJECTED: "bad", UNPUBLISHED: "neutral", DRAFT: "neutral", APPROVED: "good" };
const ORDER_LABEL = { NEW: "New", CONFIRMED: "Confirmed", AWAITING_PAYMENT: "Awaiting payment", PAID: "Paid", PROCESSING: "Processing", READY_FOR_COLLECTION: "Ready", DISPATCHED: "Dispatched", COMPLETED: "Completed", REJECTED: "Rejected", CANCELLED: "Cancelled", EXPIRED: "Expired" };
const PACKAGE_LABEL = { FULL: "Full", INVENTORY_ONLY: "Inventory Only", STORE_INVENTORY: "Store and Inventory", POS_INVENTORY: "POS and Inventory" };
const FIELD = {
  registeredName: "Registered name", tradingName: "Trading name", registrationNumber: "Registration number", businessType: "Business type", description: "Description",
  address: "Address", city: "City", region: "Region", country: "Country", phone: "Phone", email: "Email", repName: "Representative", repPosition: "Position",
  repPhone: "Representative phone", repEmail: "Representative email", categories: "Categories", productCount: "Product count", physicalPresence: "Physical shop",
  onlinePresence: "Online presence", fulfilment: "Fulfilment", offersDelivery: "Offers delivery", offersCollection: "Offers collection",
};

async function api(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body };
  } catch {
    return { ok: false, body: { error: "Couldn't reach the server." } };
  }
}

function useList(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await api(url);
    if (!r.ok) return setError(r.body.error ?? "Could not load.");
    setError("");
    setData(r.body);
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

function Tabs({ tab, setTab }) {
  const { t } = useAdmin();
  return (
    <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.border}`, marginBottom: 16, overflowX: "auto" }}>
      {TABS.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          style={{ border: "none", background: "transparent", padding: "9px 14px", fontSize: 13.5, fontWeight: tab === k ? 700 : 500, color: tab === k ? t.accent : t.text, borderBottom: `2px solid ${tab === k ? t.accent : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
          {l}
        </button>
      ))}
    </div>
  );
}

function StoreBody({ initialTab }) {
  const [tab, setTabState] = useState(initialTab ?? "overview");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    if (p && TABS.some(([k]) => k === p)) setTabState(p);
  }, []);
  const setTab = (k) => { setTabState(k); try { window.history.replaceState(null, "", `/admin/store?tab=${k}`); } catch {} };
  return (
    <>
      <Tabs tab={tab} setTab={setTab} />
      {tab === "overview" && <Overview setTab={setTab} />}
      {tab === "applications" && <Applications />}
      {tab === "sellers" && <Sellers />}
      {tab === "listings" && <Listings />}
      {tab === "orders" && <Orders />}
      {tab === "settings" && <SettingsTab />}
    </>
  );
}

export default function AdminStore({ initialTab = undefined }) {
  return (
    <AdminShell active="/admin/store" title="Insight Store" subtitle="Marketplace sellers, listings and orders">
      <StoreBody initialTab={initialTab} />
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
function Overview({ setTab }) {
  const { t } = useAdmin();
  const { data, error } = useList("/api/admin/store/overview");
  if (error) return <Notice t={t}>{error}</Notice>;
  if (!data) return <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div>;
  const pendingApps = (data.applications.SUBMITTED ?? 0) + (data.applications.UNDER_REVIEW ?? 0);
  const pendingListings = (data.listings.SUBMITTED ?? 0) + (data.listings.UNDER_REVIEW ?? 0);
  const orders = Object.values(data.orders30d).reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {!data.config.isOpen && <Notice t={t} tone="warn">The marketplace is closed to new orders. {data.config.announcement ?? ""}</Notice>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <button onClick={() => setTab("applications")} style={{ all: "unset", cursor: "pointer" }}><Stat t={t} label="Applications to review" value={fmtNum(pendingApps)} sub={`${fmtNum(data.applications.INFO_REQUIRED ?? 0)} waiting on business`} /></button>
        <button onClick={() => setTab("listings")} style={{ all: "unset", cursor: "pointer" }}><Stat t={t} label="Listings to review" value={fmtNum(pendingListings)} /></button>
        <Stat t={t} label="Active sellers" value={fmtNum(data.sellers.ACTIVE ?? 0)} sub={`${fmtNum(data.sellers.SUSPENDED ?? 0)} suspended`} />
        <Stat t={t} label="Live listings" value={fmtNum(data.listings.PUBLISHED ?? 0)} />
        <Stat t={t} label="Orders (30 days)" value={fmtNum(orders)} sub={`${fmtNum(data.orders30d.NEW ?? 0)} awaiting seller · ${fmtNum(data.orders30d.EXPIRED ?? 0)} expired`} />
        <Stat t={t} label="Completed value (30 days)" value={fmtMoney(data.completed30d.value, "GHS")} sub={`${fmtNum(data.completed30d.count)} orders · as recorded by sellers`} />
      </div>
      <Card t={t} title="Share and attribution (30 days)">
        <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 10 }}>Insight's own counts of share-button taps, visits through shared links and orders after such visits. Not data from the social networks.</div>
        {data.channels.length === 0 ? <div style={{ fontSize: 13, color: t.muted }}>No activity yet.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ color: t.muted, fontSize: 11.5, textAlign: "left" }}><th style={{ padding: 6 }}>Channel</th><th style={{ padding: 6 }}>Event</th><th style={{ padding: 6 }}>Count</th></tr></thead>
            <tbody>{data.channels.map((c) => <tr key={c.channel + c.event} style={{ borderTop: `1px solid ${t.border}` }}><td style={{ padding: 6 }}>{c.channel}</td><td style={{ padding: 6 }}>{c.event.toLowerCase()}</td><td style={{ padding: 6 }}>{fmtNum(c.count)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Applications() {
  const { t } = useAdmin();
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const id = setTimeout(() => setQuery(q), 300); return () => clearTimeout(id); }, [q]);
  const { data, error } = useList(`/api/admin/store/applications?status=${status}&q=${encodeURIComponent(query)}`);
  const td = { padding: "10px 12px", fontSize: 13, borderBottom: `1px solid ${t.border}` };
  return (
    <Card t={t}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <input aria-label="Search applications" placeholder="Reference or business name" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle(t), maxWidth: 320 }} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle(t), width: "auto" }}>
          <option value="PENDING">Needs attention</option><option value="">All submitted</option>
          {Object.entries(APP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {error ? <Notice t={t}>{error}</Notice> : !data ? <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div> : data.applications.length === 0 ? (
        <div style={{ color: t.muted, fontSize: 13, padding: "18px 0" }}>No applications here.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ color: t.muted, fontSize: 11.5, textAlign: "left" }}>{["Reference", "Business", "Status", "Submitted", "Docs", "Package"].map((h) => <th key={h} style={{ padding: "8px 12px", borderBottom: `1px solid ${t.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.applications.map((a) => (
                <tr key={a.id}>
                  <td style={td}><a href={`/admin/store/applications/${a.id}`} style={{ color: t.accent, fontWeight: 600 }}>{a.reference}</a></td>
                  <td style={td}>{a.business.name}<div style={{ fontSize: 11.5, color: t.muted }}>{a.city ?? ""}</div></td>
                  <td style={td}><Badge t={t} tone={APP_TONE[a.status]}>{APP_LABEL[a.status]}</Badge></td>
                  <td style={td}>{fmtDateTime(a.submittedAt)}</td>
                  <td style={td}>{a._count.documents}</td>
                  <td style={td}>{PACKAGE_LABEL[a.business.appMode]}{a.requestedAppMode && a.requestedAppMode !== a.business.appMode ? ` → ${PACKAGE_LABEL[a.requestedAppMode]}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ApplicationDetailBody({ id }) {
  const { t } = useAdmin();
  const { data, error, reload } = useList(`/api/admin/store/applications/${id}`);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState("");

  async function act(action, text) {
    setBusy(true);
    setDialogError("");
    const r = await api(`/api/admin/store/applications/${id}/action`, { method: "POST", body: JSON.stringify({ action, message: text }) });
    setBusy(false);
    if (!r.ok) return setDialogError(r.body.error ?? "Failed.");
    setDialog(null);
    setMessage("");
    setNote("");
    setDone(action === "approve" ? `Approved. The seller record was created${r.body.packageApplied ? ` and the package changed to ${PACKAGE_LABEL[r.body.packageApplied]}` : ""}. No products were published.` : action === "note" ? "Internal note added." : "Application updated.");
    reload();
  }

  if (error) return <Notice t={t}>{error}</Notice>;
  if (!data) return <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div>;
  const a = data.application;
  const canManage = data.permissions.includes("marketplace.manage");
  const d = a.data ?? {};
  const fmt = (v) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : v || "—");
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div><a href="/admin/store?tab=applications" style={{ color: t.accent, fontSize: 13 }}>← All applications</a></div>
      {done && <Notice t={t} tone="good">{done}</Notice>}
      <Card t={t}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{a.business.name}</div>
            <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>{a.reference} · started {fmtDateTime(a.createdAt)}{a.submittedAt ? ` · submitted ${fmtDateTime(a.submittedAt)}` : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Badge t={t} tone={APP_TONE[a.status]}>{APP_LABEL[a.status]}</Badge>
              <Badge t={t}>{PACKAGE_LABEL[a.business.appMode]}</Badge>
              {(a.business.pendingAppMode || a.requestedAppMode) && <Badge t={t} tone="warn">Requests {PACKAGE_LABEL[a.business.pendingAppMode ?? a.requestedAppMode]}</Badge>}
              {a.business.status !== "ACTIVE" && <Badge t={t} tone="bad">Business suspended</Badge>}
            </div>
            <div style={{ fontSize: 12.5, color: t.muted, marginTop: 8 }}>
              Insight account since {fmtDateTime(a.business.createdAt)} · {a.business._count.products} products · {a.business._count.branches} branches · {a.business._count.users} users ·{" "}
              <a href={`/admin/businesses/${a.business.id}`} style={{ color: t.accent }}>Business record</a>
            </div>
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {a.status === "SUBMITTED" && <Button t={t} onClick={() => act("start_review", "")} disabled={busy}>Start review</Button>}
              {["SUBMITTED", "UNDER_REVIEW"].includes(a.status) && <Button t={t} onClick={() => { setDialogError(""); setDialog("request_info"); }}>Request information</Button>}
              {["SUBMITTED", "UNDER_REVIEW"].includes(a.status) && <Button t={t} kind="primary" onClick={() => { setDialogError(""); setDialog("approve"); }}>Approve</Button>}
              {["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED"].includes(a.status) && <Button t={t} kind="danger" onClick={() => { setDialogError(""); setDialog("reject"); }}>Reject</Button>}
            </div>
          )}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <Card t={t} title="Application answers">
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(120px, 40%) 1fr", gap: "6px 12px", fontSize: 13 }}>
            {Object.keys(FIELD).map((k) => (
              <React.Fragment key={k}><dt style={{ color: t.muted }}>{FIELD[k]}</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{fmt(d[k])}</dd></React.Fragment>
            ))}
          </dl>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 10 }}>Submitted by {a.applicant?.name ?? "—"} ({a.applicant?.email ?? "—"})</div>
        </Card>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card t={t} title="Documents">
            {a.documents.length === 0 ? <div style={{ fontSize: 13, color: t.muted }}>No documents uploaded.</div> : a.documents.map((doc) => (
              <div key={doc.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${t.border}` }}>
                <a href={`/api/admin/store/applications/${a.id}/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" style={{ color: t.accent, fontWeight: 600 }}>{doc.fileName}</a>
                <div style={{ fontSize: 11.5, color: t.muted }}>{doc.docKey} · {doc.mimeType} · {Math.round(doc.sizeBytes / 1024)} KB · SHA-256 {doc.sha256.slice(0, 12)}…</div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: t.muted, marginTop: 8 }}>Opening a document is recorded in the audit log.</div>
          </Card>
          <Card t={t} title="Timeline">
            {a.events.map((e) => (
              <div key={e.id} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${t.border}`, background: e.internal ? t.warnSoft : "transparent" }}>
                <b>{e.action.replace(/_/g, " ").toLowerCase()}</b> · {e.actorLabel ?? e.actorType} · {fmtDateTime(e.createdAt)}{e.internal ? " · internal" : ""}
                {e.note && <div style={{ color: t.muted, whiteSpace: "pre-wrap", marginTop: 2 }}>{e.note}</div>}
              </div>
            ))}
            {canManage && (
              <div style={{ marginTop: 10 }}>
                <textarea aria-label="Internal note" placeholder="Internal note (never shown to the business)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...inputStyle(t), resize: "vertical" }} />
                <Button t={t} style={{ marginTop: 6 }} disabled={busy || note.trim().length < 2} onClick={() => act("note", note)}>Add note</Button>
              </div>
            )}
          </Card>
          {data.previous.length > 0 && (
            <Card t={t} title="Earlier applications">
              {data.previous.map((p) => <div key={p.id} style={{ fontSize: 12.5, padding: "4px 0" }}><a href={`/admin/store/applications/${p.id}`} style={{ color: t.accent }}>{p.reference}</a> · {APP_LABEL[p.status]} · {fmtDateTime(p.decidedAt ?? p.createdAt)}{p.decisionReason ? ` · ${p.decisionReason}` : ""}</div>)}
            </Card>
          )}
        </div>
      </div>

      {dialog === "approve" && (
        <ConfirmDialog t={t} busy={busy} error={dialogError} confirmLabel="Approve seller" title={`Approve ${a.business.name}?`}
          body={`This creates their Insight Store seller profile${(a.business.pendingAppMode ?? a.requestedAppMode) && (a.business.pendingAppMode ?? a.requestedAppMode) !== a.business.appMode ? ` and switches their package to ${PACKAGE_LABEL[a.business.pendingAppMode ?? a.requestedAppMode]}` : ""}. No products are published: each listing they create is reviewed separately.`}
          onCancel={() => setDialog(null)} onConfirm={() => act("approve", message)}>
          <label htmlFor="appr-msg" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 5 }}>Message to the business (optional)</label>
          <textarea id="appr-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...inputStyle(t), marginBottom: 8 }} />
        </ConfirmDialog>
      )}
      {(dialog === "reject" || dialog === "request_info") && (
        <ConfirmDialog t={t} busy={busy} error={dialogError} danger={dialog === "reject"} requireReason
          confirmLabel={dialog === "reject" ? "Reject application" : "Send request"}
          title={dialog === "reject" ? "Reject this application?" : "Request more information"}
          body={dialog === "reject" ? "The business sees your reason and can apply again later." : "The business sees your message and can update the application and resubmit."}
          onCancel={() => setDialog(null)} onConfirm={(reason) => act(dialog, reason)} />
      )}
    </div>
  );
}

export function AdminStoreApplication({ id }) {
  return (
    <AdminShell active="/admin/store" title="Seller application" subtitle="Insight Store review">
      <ApplicationDetailBody id={id} />
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
function Sellers() {
  const { t, me } = useAdmin();
  const [status, setStatus] = useState("");
  const { data, error, reload } = useList(`/api/admin/store/sellers?status=${status}`);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const canManage = me?.permissions?.includes("marketplace.manage");
  async function act(seller, action, reason) {
    setBusy(true);
    setDialogError("");
    const r = await api(`/api/admin/store/sellers/${seller.id}`, { method: "PATCH", body: JSON.stringify({ action, reason }) });
    setBusy(false);
    if (!r.ok) return setDialogError(r.body.error ?? "Failed.");
    setDialog(null);
    reload();
  }
  const td = { padding: "10px 12px", fontSize: 13, borderBottom: `1px solid ${t.border}` };
  return (
    <Card t={t}>
      <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle(t), width: "auto", marginBottom: 12 }}>
        <option value="">All sellers</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option>
      </select>
      {error ? <Notice t={t}>{error}</Notice> : !data ? <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div> : data.sellers.length === 0 ? <div style={{ color: t.muted, fontSize: 13 }}>No sellers yet. Approve an application to create one.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ color: t.muted, fontSize: 11.5, textAlign: "left" }}>{["Seller", "Status", "Package", "Live / all listings", "Orders", "WhatsApp", "Approved", ""].map((h) => <th key={h} style={{ padding: "8px 12px", borderBottom: `1px solid ${t.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.sellers.map((s) => (
                <tr key={s.id}>
                  <td style={td}><a href={`/store/s/${s.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: t.accent, fontWeight: 600 }}>{s.business.name}</a>{s.isFeatured && <span style={{ marginLeft: 6 }}><Badge t={t} tone="good">Featured</Badge></span>}<div style={{ fontSize: 11.5, color: t.muted }}>{s.city ?? ""}</div></td>
                  <td style={td}><Badge t={t} tone={s.status === "ACTIVE" ? "good" : "bad"}>{s.status === "ACTIVE" ? "Active" : "Suspended"}</Badge>{s.suspendedReason && <div style={{ fontSize: 11.5, color: t.muted }}>{s.suspendedReason}</div>}</td>
                  <td style={td}>{PACKAGE_LABEL[s.business.appMode]}</td>
                  <td style={td}>{s.liveListings} / {s.business._count.storeListings}</td>
                  <td style={td}>{s.business._count.storeOrders}</td>
                  <td style={td}>{s.hasWhatsApp ? "Set" : <span style={{ color: t.warn }}>Missing</span>}</td>
                  <td style={td}>{fmtDateTime(s.approvedAt)}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {canManage && <>
                      <Button t={t} style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => act(s, s.isFeatured ? "unfeature" : "feature")}>{s.isFeatured ? "Unfeature" : "Feature"}</Button>{" "}
                      {s.status === "ACTIVE"
                        ? <Button t={t} kind="danger" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { setDialogError(""); setDialog({ s, action: "suspend" }); }}>Suspend</Button>
                        : <Button t={t} kind="primary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { setDialogError(""); setDialog({ s, action: "reinstate" }); }}>Reinstate</Button>}
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && (
        <ConfirmDialog t={t} busy={busy} error={dialogError} requireReason danger={dialog.action === "suspend"}
          confirmLabel={dialog.action === "suspend" ? "Suspend selling" : "Reinstate selling"}
          title={`${dialog.action === "suspend" ? "Suspend" : "Reinstate"} ${dialog.s.business.name}?`}
          body={dialog.action === "suspend" ? "Their listings disappear from the marketplace and they can't change listings or orders until reinstated. Their Insight account is not affected; nothing is deleted." : "Their live listings become visible again."}
          onCancel={() => setDialog(null)} onConfirm={(reason) => act(dialog.s, dialog.action, reason)} />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
function Listings() {
  const { t, me } = useAdmin();
  const [status, setStatus] = useState("PENDING");
  const { data, error, reload } = useList(`/api/admin/store/listings?status=${status}`);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const canManage = me?.permissions?.includes("marketplace.manage");
  async function act(l, action, reason) {
    setBusy(true);
    setDialogError("");
    const r = await api(`/api/admin/store/listings/${l.id}/action`, { method: "POST", body: JSON.stringify({ action, reason }) });
    setBusy(false);
    if (!r.ok) { setDialogError(r.body.error ?? "Failed."); if (!dialog) alertInline(r.body.error); return; }
    setDialog(null);
    reload();
  }
  const [inline, setInline] = useState("");
  function alertInline(text) { setInline(text ?? ""); }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle(t), width: "auto" }}>
        <option value="PENDING">Waiting for review</option><option value="">All (excluding drafts)</option>
        {Object.entries(LIST_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {inline && <Notice t={t}>{inline}</Notice>}
      {error ? <Notice t={t}>{error}</Notice> : !data ? <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div> : data.listings.length === 0 ? <Card t={t}><div style={{ color: t.muted, fontSize: 13 }}>Nothing here.</div></Card> : data.listings.map((l) => (
        <Card t={t} key={l.id}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 260 }}>
              {l.images.length ? l.images.slice(0, 4).map((img) => <img key={img.id} src={`/api/admin/store/images/${img.id}`} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: `1px solid ${t.border}` }} />)
                : <div style={{ width: 60, height: 60, borderRadius: 6, background: t.surfaceAlt, fontSize: 11, color: t.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>No photo</div>}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>{l.title}</b><Badge t={t} tone={LIST_TONE[l.status]}>{LIST_LABEL[l.status]}</Badge>{l.isFeatured && <Badge t={t} tone="good">Featured</Badge>}
              </div>
              <div style={{ fontSize: 12.5, color: t.muted, marginTop: 3 }}>
                {l.business.name} · {fmtMoney(l.effectivePrice, l.business.currency)}{l.price === null ? " (inventory price)" : ""} · {l.category?.name ?? "No category"} · {l.available} in stock · SKU {l.product.sku}
              </div>
              {l.description && <div style={{ fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 90, overflow: "auto" }}>{l.description}</div>}
              {l.rejectionReason && <div style={{ fontSize: 12, color: t.danger, marginTop: 4 }}>Last reason: {l.rejectionReason}</div>}
            </div>
            {canManage && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                {l.status === "SUBMITTED" && <Button t={t} disabled={busy} onClick={() => act(l, "start_review")}>Start review</Button>}
                {["SUBMITTED", "UNDER_REVIEW"].includes(l.status) && <Button t={t} kind="primary" disabled={busy} onClick={() => act(l, "approve")}>Approve and publish</Button>}
                {["SUBMITTED", "UNDER_REVIEW"].includes(l.status) && <Button t={t} kind="danger" onClick={() => { setDialogError(""); setDialog({ l, action: "reject" }); }}>Reject</Button>}
                {l.status === "PUBLISHED" && <Button t={t} kind="danger" onClick={() => { setDialogError(""); setDialog({ l, action: "admin_unpublish" }); }}>Take down</Button>}
                {l.status === "PUBLISHED" && <Button t={t} disabled={busy} onClick={() => act(l, l.isFeatured ? "unfeature" : "feature")}>{l.isFeatured ? "Unfeature" : "Feature"}</Button>}
                {l.status === "PUBLISHED" && <a href={`/store/p/${l.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: t.accent, alignSelf: "center" }}>View</a>}
              </div>
            )}
          </div>
        </Card>
      ))}
      {dialog && (
        <ConfirmDialog t={t} busy={busy} error={dialogError} requireReason danger
          confirmLabel={dialog.action === "reject" ? "Reject listing" : "Take down listing"}
          title={dialog.action === "reject" ? `Reject “${dialog.l.title}”?` : `Take down “${dialog.l.title}”?`}
          body="The seller sees your reason. They can fix the listing and submit it again."
          onCancel={() => setDialog(null)} onConfirm={(reason) => act(dialog.l, dialog.action, reason)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Orders() {
  const { t } = useAdmin();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const id = setTimeout(() => setQuery(q), 300); return () => clearTimeout(id); }, [q]);
  const { data, error } = useList(`/api/admin/store/orders?status=${status}&q=${encodeURIComponent(query)}`);
  const [open, setOpen] = useState(null);
  const td = { padding: "10px 12px", fontSize: 13, borderBottom: `1px solid ${t.border}` };
  return (
    <Card t={t}>
      <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 10 }}>Read-only oversight. Sellers manage their own orders; payment is arranged between seller and customer outside Insight.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <input aria-label="Search orders" placeholder="Reference or seller" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle(t), maxWidth: 300 }} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle(t), width: "auto" }}>
          <option value="">All statuses</option>
          {Object.entries(ORDER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {error ? <Notice t={t}>{error}</Notice> : !data ? <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div> : data.orders.length === 0 ? <div style={{ color: t.muted, fontSize: 13 }}>No orders.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ color: t.muted, fontSize: 11.5, textAlign: "left" }}>{["Reference", "Seller", "Customer", "Status", "Payment", "Total", "Placed", "WhatsApp link"].map((h) => <th key={h} style={{ padding: "8px 12px", borderBottom: `1px solid ${t.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td style={td}><button onClick={() => setOpen(o.id)} style={{ border: "none", background: "transparent", color: t.accent, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>{o.reference}</button></td>
                  <td style={td}>{o.business.name}</td>
                  <td style={td}>{o.customerName}</td>
                  <td style={td}>{ORDER_LABEL[o.status]}</td>
                  <td style={td}>{o.paymentStatus.toLowerCase()}</td>
                  <td style={td}>{fmtMoney(o.subtotal, o.currency)}</td>
                  <td style={td}>{fmtDateTime(o.createdAt)}</td>
                  <td style={td}>{o.whatsappOpenedAt ? "Opened by customer" : "Not opened"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <OrderModal id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function OrderModal({ id, onClose }) {
  const { t } = useAdmin();
  const { data, error } = useList(`/api/admin/store/orders/${id}`);
  const o = data?.order;
  return (
    <div role="dialog" aria-modal="true" aria-label="Order" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 12px", overflowY: "auto" }}>
      <div style={{ width: "min(640px, 100%)", background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", marginBottom: 10 }}><b style={{ fontSize: 16 }}>{o ? `Order ${o.reference}` : "Order"}</b><Button t={t} style={{ marginLeft: "auto" }} onClick={onClose}>Close</Button></div>
        {error ? <Notice t={t}>{error}</Notice> : !o ? <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div> : (
          <>
            <div style={{ fontSize: 13, marginBottom: 10 }}>{o.business.name} · {ORDER_LABEL[o.status]} · payment {o.paymentStatus.toLowerCase()} · {o.fulfilment.toLowerCase()}{o.branch ? ` · stock from ${o.branch.name}` : ""}</div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>Customer: {o.customerName} · +{o.customerPhone}{o.customerEmail ? ` · ${o.customerEmail}` : ""}</div>
            {o.items.map((i) => <div key={i.id} style={{ fontSize: 13, padding: "4px 0", borderTop: `1px solid ${t.border}` }}>{i.quantity} × {i.titleSnapshot} — {fmtMoney(i.lineTotal, o.currency)}</div>)}
            <div style={{ fontWeight: 700, fontSize: 13, padding: "6px 0", borderTop: `1px solid ${t.border}` }}>Total {fmtMoney(o.subtotal, o.currency)}</div>
            <div style={{ marginTop: 10 }}>{o.events.map((e) => <div key={e.id} style={{ fontSize: 12.5, color: t.muted, padding: "3px 0" }}><b style={{ color: t.text }}>{e.action.replace(/_/g, " ").toLowerCase()}</b> · {e.actorLabel ?? e.actorType} · {fmtDateTime(e.createdAt)}{e.note ? ` — ${e.note}` : ""}</div>)}</div>
            <div style={{ fontSize: 11.5, color: t.muted, marginTop: 10 }}>Viewing this order was recorded in the audit log.</div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SettingsTab() {
  const { t } = useAdmin();
  const { data, error, reload } = useList("/api/admin/store/config");
  const [form, setForm] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [msg, setMsg] = useState("");
  const [newCat, setNewCat] = useState("");
  useEffect(() => {
    if (data) setForm({ isOpen: data.config.isOpen, announcement: data.config.announcement ?? "", orderExpiryHours: data.config.orderExpiryHours, requiredDocuments: data.config.requiredDocuments ?? [] });
  }, [data]);
  if (error) return <Notice t={t}>{error}</Notice>;
  if (!data || !form) return <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div>;
  const canManage = data.permissions.includes("marketplace.manage");
  async function save(reason) {
    setBusy(true);
    setDialogError("");
    const r = await api("/api/admin/store/config", { method: "PATCH", body: JSON.stringify({ ...form, announcement: form.announcement || null, orderExpiryHours: Number(form.orderExpiryHours), reason }) });
    setBusy(false);
    if (!r.ok) return setDialogError(r.body.error ?? "Failed.");
    setDialog(false);
    setMsg("Settings saved.");
    reload();
  }
  async function addCat() {
    const r = await api("/api/admin/store/categories", { method: "POST", body: JSON.stringify({ name: newCat }) });
    setMsg(r.ok ? "Category added." : r.body.error);
    if (r.ok) { setNewCat(""); reload(); }
  }
  async function patchCat(c, patch) {
    const r = await api(`/api/admin/store/categories/${c.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (!r.ok) setMsg(r.body.error);
    reload();
  }
  const docs = form.requiredDocuments;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      {msg && <Notice t={t} tone="good">{msg}</Notice>}
      <Card t={t} title="Marketplace" action={canManage && <Button t={t} kind="primary" onClick={() => { setDialogError(""); setDialog(true); }}>Save changes</Button>}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, marginBottom: 12 }}>
          <input type="checkbox" checked={form.isOpen} disabled={!canManage} onChange={(e) => setForm({ ...form, isOpen: e.target.checked })} /> Accepting new orders
        </label>
        <label htmlFor="cfg-ann" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 5 }}>Announcement banner (optional)</label>
        <input id="cfg-ann" value={form.announcement} disabled={!canManage} maxLength={500} onChange={(e) => setForm({ ...form, announcement: e.target.value })} style={{ ...inputStyle(t), marginBottom: 12 }} />
        <label htmlFor="cfg-exp" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 5 }}>Hours a seller has to respond before a request expires</label>
        <input id="cfg-exp" type="number" min={1} max={336} value={form.orderExpiryHours} disabled={!canManage} onChange={(e) => setForm({ ...form, orderExpiryHours: e.target.value })} style={{ ...inputStyle(t), width: 120, marginBottom: 14 }} />
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Application documents</div>
        {docs.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <input aria-label="Document key" value={d.key} disabled={!canManage} onChange={(e) => setForm({ ...form, requiredDocuments: docs.map((x, j) => (j === i ? { ...x, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } : x)) })} style={{ ...inputStyle(t), width: 140 }} />
            <input aria-label="Document label" value={d.label} disabled={!canManage} onChange={(e) => setForm({ ...form, requiredDocuments: docs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={{ ...inputStyle(t), flex: 1, minWidth: 180 }} />
            <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={d.required} disabled={!canManage} onChange={(e) => setForm({ ...form, requiredDocuments: docs.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} /> Required</label>
            {canManage && <Button t={t} style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => setForm({ ...form, requiredDocuments: docs.filter((_, j) => j !== i) })}>Remove</Button>}
          </div>
        ))}
        {canManage && docs.length < 10 && <Button t={t} style={{ fontSize: 12 }} onClick={() => setForm({ ...form, requiredDocuments: [...docs, { key: `doc_${docs.length + 1}`, label: "", required: false }] })}>Add document type</Button>}
      </Card>
      <Card t={t} title="Categories">
        {data.categories.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${t.border}`, fontSize: 13 }}>
            <span style={{ flex: 1, color: c.isActive ? t.text : t.muted }}>{c.name} <span style={{ color: t.muted, fontSize: 11.5 }}>· {c._count.listings} listings · /{c.slug}</span></span>
            {canManage && <Button t={t} style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => patchCat(c, { isActive: !c.isActive })}>{c.isActive ? "Hide" : "Show"}</Button>}
          </div>
        ))}
        {canManage && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input aria-label="New category" placeholder="New category name" value={newCat} maxLength={60} onChange={(e) => setNewCat(e.target.value)} style={{ ...inputStyle(t), maxWidth: 280 }} />
            <Button t={t} disabled={newCat.trim().length < 2} onClick={addCat}>Add</Button>
          </div>
        )}
      </Card>
      {dialog && (
        <ConfirmDialog t={t} busy={busy} error={dialogError} requireReason confirmLabel="Save settings" title="Save marketplace settings?"
          body={form.isOpen ? "Changes apply to the public marketplace immediately." : "Closing the marketplace stops new orders immediately. Customers can still browse; existing orders are unaffected."}
          onCancel={() => setDialog(false)} onConfirm={save} />
      )}
    </div>
  );
}
