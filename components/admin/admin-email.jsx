"use client";

import React, { useCallback, useEffect, useState } from "react";
import AdminShell, { useAdmin } from "./admin-shell";
import { Badge, Button, Card, ConfirmDialog, Notice, Stat, fmtDateTime, fmtNum, inputStyle } from "./ui";

// Super Admin → Email. Status, configuration, delivery activity and a real test
// send. Secrets, message contents and tokens are never shown.

const TONE = { DELIVERED: "good", SENT: "good", QUEUED: "warn", SENDING: "warn", DELAYED: "warn", SKIPPED: "neutral", BOUNCED: "bad", COMPLAINED: "bad", FAILED: "bad", SUPPRESSED: "bad" };
const REASON = { ok: "Sending is on.", env_disabled: "Off: EMAIL_ENABLED is not set to true in the environment.", no_api_key: "Off: RESEND_API_KEY is not configured.", admin_disabled: "Off: switched off by a Super Admin." };

async function api(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
    return { ok: res.ok, body: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, body: { error: "Couldn't reach the server." } };
  }
}

export default function AdminEmail() {
  return (
    <AdminShell active="/admin/email" title="Email" subtitle="Transactional email status and delivery">
      <Body />
    </AdminShell>
  );
}

function Body() {
  const { t } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [addr, setAddr] = useState("");
  const [dialogErr, setDialogErr] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api("/api/admin/email");
    if (!r.ok) return setError(r.body.error ?? "Could not load.");
    setError(""); setData(r.body);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sendTest() {
    setBusy(true); setTest(null);
    const r = await api("/api/admin/email/test", { method: "POST" });
    setTest({ ok: r.ok, ...r.body });
    setBusy(false); load();
  }
  async function processQueue() {
    setBusy(true);
    const r = await api("/api/admin/email/process", { method: "POST" });
    setTest({ ok: r.ok, queue: r.body });
    setBusy(false); load();
  }
  async function patch(payload, reason) {
    setDialogBusy(true); setDialogErr("");
    const r = await api("/api/admin/email", { method: "PATCH", body: JSON.stringify({ ...payload, reason }) });
    setDialogBusy(false);
    if (!r.ok) return setDialogErr(r.body.error ?? "Could not save.");
    setDialog(null); setData({ ...r.body, canManage: data.canManage });
  }

  if (error) return <Notice t={t}>{error}</Notice>;
  if (!data) return <div style={{ color: t.muted, fontSize: 13 }}>Loading…</div>;
  const { state, config, domain, last7Days } = data;
  const by = last7Days.byStatus;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Notice t={t} tone={state.enabled ? "good" : "warn"}>{REASON[state.reason]}{config.usingTestSender ? " Using Resend's test sender: it can only deliver to the Resend account owner's own address." : ""}</Notice>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat t={t} label="Delivered (7 days)" value={fmtNum(by.DELIVERED ?? 0)} />
        <Stat t={t} label="Sent, not confirmed" value={fmtNum(by.SENT ?? 0)} />
        <Stat t={t} label="Queued" value={fmtNum(data.queued)} />
        <Stat t={t} label="Failed" value={fmtNum(by.FAILED ?? 0)} />
        <Stat t={t} label="Bounced" value={fmtNum(by.BOUNCED ?? 0)} />
        <Stat t={t} label="Complaints" value={fmtNum(by.COMPLAINED ?? 0)} />
      </div>

      <Card t={t} title="Configuration">
        <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
          <Row t={t} k="Provider" v={config.provider} />
          <Row t={t} k="API key" v={config.apiKeyConfigured ? "Configured" : "Not configured"} />
          <Row t={t} k="Webhook secret" v={config.webhookSecretConfigured ? "Configured" : "Not configured"} />
          <Row t={t} k="Retry cron secret" v={config.cronSecretConfigured ? "Configured" : "Not configured"} />
          <Row t={t} k="Sender" v={`${config.fromName} <${config.fromAddress}>`} />
          <Row t={t} k="Reply-To" v={config.replyTo} />
          <Row t={t} k="Central address (admin and contact mail)" v={`${config.centralAddress}${config.centralAddressOverridden ? " (set by Super Admin)" : ""}`} />
          <Row t={t} k="Links point to" v={config.appUrl} />
          <Row t={t} k="Sending domain" v={domain.available ? (domain.domains.length ? domain.domains.map((d) => `${d.name}: ${d.status}`).join(", ") : "No domain added in Resend yet") : `Not available. ${domain.reason}`} />
        </div>
        {data.canManage ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <Button t={t} kind={state.adminEnabled ? "secondary" : "primary"} onClick={() => setDialog({ type: "toggle" })}>{state.adminEnabled ? "Switch email off" : "Switch email on"}</Button>
            <Button t={t} onClick={() => { setAddr(config.centralAddress); setDialog({ type: "address" }); }}>Change central address</Button>
            <Button t={t} onClick={processQueue} disabled={busy}>Process queue now</Button>
            <Button t={t} kind="primary" onClick={sendTest} disabled={busy || !state.enabled}>{busy ? "Working…" : "Send test email"}</Button>
          </div>
        ) : <div style={{ fontSize: 12.5, color: t.muted, marginTop: 14 }}>Only Super Admins can change these settings.</div>}
        {test && (
          <div style={{ marginTop: 12 }}>
            <Notice t={t} tone={test.ok ? "good" : "bad"}>
              {test.queue ? `Processed ${test.queue.processed ?? 0}: ${test.queue.sent ?? 0} sent, ${test.queue.requeued ?? 0} retrying, ${test.queue.failed ?? 0} failed.` : (
                <>Result: <strong>{test.result ?? "error"}</strong>{test.status ? `, status ${test.status}` : ""}{test.providerId ? `, provider id ${test.providerId}` : ""}{test.error ? `. Provider said: ${test.error}` : ""}{test.note ? ` ${test.note}` : ""}</>
              )}
            </Notice>
          </div>
        )}
      </Card>

      <Card t={t} title="By category (7 days)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.keys(last7Days.byCategory).length === 0 ? <span style={{ fontSize: 13, color: t.muted }}>No email activity yet.</span> : Object.entries(last7Days.byCategory).map(([k, v]) => <Badge key={k} t={t}>{k}: {v}</Badge>)}
        </div>
      </Card>

      <Card t={t} title="Recent activity" action={<Button t={t} onClick={load}>Refresh</Button>}>
        <div style={{ fontSize: 12, color: t.muted, marginBottom: 8 }}>Recipient addresses are masked. Message contents and links are never stored or shown.</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ color: t.muted, fontSize: 11.5, textAlign: "left" }}>{["Time", "Category", "Template", "To", "Status", "Tries", "Note"].map((h) => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.recent.map((m) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>{fmtDateTime(m.createdAt)}</td><td style={{ padding: 6 }}>{m.category}</td><td style={{ padding: 6 }}>{m.template}</td><td style={{ padding: 6 }}>{m.toAddress}</td>
                  <td style={{ padding: 6 }}><Badge t={t} tone={TONE[m.status] ?? "neutral"}>{m.status}</Badge></td><td style={{ padding: 6 }}>{m.attempts}</td><td style={{ padding: 6, color: t.muted }}>{m.lastError ?? ""}</td>
                </tr>
              ))}
              {data.recent.length === 0 && <tr><td colSpan={7} style={{ padding: 10, color: t.muted }}>Nothing yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {dialog?.type === "toggle" && (
        <ConfirmDialog t={t} title={state.adminEnabled ? "Switch email off?" : "Switch email on?"} body={state.adminEnabled ? "No email will be sent until it is switched on again. Sign-ups and other actions keep working." : "Email still needs EMAIL_ENABLED=true and an API key in the environment."} confirmLabel={state.adminEnabled ? "Switch off" : "Switch on"} requireReason busy={dialogBusy} error={dialogErr} onCancel={() => setDialog(null)} onConfirm={(reason) => patch({ enabled: !state.adminEnabled }, reason)} />
      )}
      {dialog?.type === "address" && (
        <ConfirmDialog t={t} title="Change the central address" body="All admin notifications and contact-form messages go here. Leave empty to return to the configured default." confirmLabel="Save address" requireReason busy={dialogBusy} error={dialogErr} onCancel={() => setDialog(null)} onConfirm={(reason) => patch({ centralAddress: addr.trim() || null }, reason)}>
          <input style={{ ...inputStyle(t), marginBottom: 12 }} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="name@example.com" />
        </ConfirmDialog>
      )}
    </div>
  );
}

function Row({ t, k, v }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><span style={{ color: t.muted, minWidth: 230 }}>{k}</span><span style={{ fontWeight: 600, wordBreak: "break-all" }}>{v}</span></div>;
}
