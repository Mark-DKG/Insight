"use client";

import React, { useCallback, useEffect, useState } from "react";
import AdminShell, { useAdmin } from "./admin-shell";
import { Badge, Button, Card, ConfirmDialog, Notice, Stat, fmtDate, fmtDateTime, fmtMoney, fmtNum, inputStyle } from "./ui";

const PACKAGE_LABEL = { FULL: "Full", INVENTORY_ONLY: "Inventory Only", STORE_INVENTORY: "Store and Inventory", POS_INVENTORY: "POS and Inventory" };

const ROLE = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier" };

function Detail({ businessId }) {
  const { t, me } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState(null); // { action, mode? }
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [flash, setFlash] = useState("");
  const [edit, setEdit] = useState(null);

  const canManage = me.permissions.includes("businesses.manage");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/businesses/${businessId}`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body?.error ?? "Could not load this business.");
      setError("");
      setData(body);
    } catch {
      setError("Couldn't reach the server.");
    }
  }, [businessId]);
  useEffect(() => { load(); }, [load]);

  const act = async (payload, success) => {
    setBusy(true);
    setDialogError("");
    try {
      const r = await fetch(`/api/admin/businesses/${businessId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setDialogError(body?.error ?? "The change could not be saved.");
      setDialog(null);
      setEdit(null);
      setFlash(success);
      await load();
    } catch {
      setDialogError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Notice t={t}>{error}</Notice>;
  if (!data) return <div style={{ color: t.muted, fontSize: 14 }}>Loading business…</div>;

  const b = data.business;
  const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 });
  const th = { padding: "9px 10px", fontSize: 11.5, fontWeight: 700, color: t.muted, textAlign: "left", borderBottom: `1px solid ${t.border}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", fontSize: 13, borderBottom: `1px solid ${t.border}`, verticalAlign: "top" };
  const tabs = [["overview", "Overview"], ["users", `Users (${data.users.length})`], ["branches", `Branches (${data.branches.length})`], ["activity", "Activity"]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13 }}><a href="/admin/businesses">← All businesses</a></div>

      <Card t={t}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{b.name}</div>
            <div style={{ fontSize: 11.5, color: t.muted, fontFamily: "ui-monospace, Menlo, monospace", marginTop: 2 }}>{b.id}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Badge t={t} tone={b.status === "ACTIVE" ? "good" : "bad"}>{b.status === "ACTIVE" ? "Active" : "Suspended"}</Badge>
              <Badge t={t}>{PACKAGE_LABEL[b.appMode] ?? b.appMode}</Badge>
              {b.pendingAppMode && <Badge t={t} tone="warn">Requested: {PACKAGE_LABEL[b.pendingAppMode]}</Badge>}
              <Badge t={t}>{b.currency}</Badge>
            </div>
            {b.status === "SUSPENDED" && (
              <div style={{ fontSize: 12.5, color: t.danger, marginTop: 8 }}>Suspended {fmtDateTime(b.suspendedAt)}: {b.suspendedReason}</div>
            )}
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <Button t={t} onClick={() => setEdit({ name: b.name, email: b.email ?? "", phone: b.phone ?? "", address: b.address ?? "" })}>Edit details</Button>
              <Button t={t} onClick={() => { setDialogError(""); setDialog({ action: "set_mode", mode: Object.keys(PACKAGE_LABEL).find((k) => k !== b.appMode) }); }}>
                Change package
              </Button>
              {b.status === "ACTIVE" ? (
                <Button t={t} kind="danger" onClick={() => { setDialogError(""); setDialog({ action: "suspend" }); }}>Suspend</Button>
              ) : (
                <Button t={t} kind="primary" onClick={() => { setDialogError(""); setDialog({ action: "reactivate" }); }}>Reactivate</Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {flash && <Notice t={t} tone="good">{flash}</Notice>}

      <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.border}`, overflowX: "auto" }}>
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ padding: "8px 12px", fontSize: 13.5, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap",
              color: tab === k ? t.accent : t.muted, borderBottom: tab === k ? `2px solid ${t.accent}` : "2px solid transparent", marginBottom: -1 }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div style={grid(150)}>
            <Stat t={t} label="Users" value={fmtNum(data.counts.users)} />
            <Stat t={t} label="Branches" value={fmtNum(data.counts.branches)} />
            <Stat t={t} label="Active products" value={fmtNum(data.counts.products)} />
            <Stat t={t} label="Customers" value={fmtNum(data.counts.customers)} />
            <Stat t={t} label="Suppliers" value={fmtNum(data.counts.suppliers)} />
            <Stat t={t} label="Purchase orders" value={fmtNum(data.counts.purchases)} />
            <Stat t={t} label="Stock movements" value={fmtNum(data.counts.inventoryMovements)} />
            <Stat t={t} label="Expenses recorded" value={fmtNum(data.counts.expenses)} />
          </div>
          <div style={grid(300)}>
            <Card t={t} title="Profile">
              {[
                ["Owner", data.owner ? `${data.owner.name} (${data.owner.email})` : "No owner"],
                ["Business email", b.email || "—"],
                ["Phone", b.phone || "—"],
                ["Address", b.address || "—"],
                ["Tax rate", `${Number(b.taxRate)}%`],
                ["Registered", fmtDateTime(b.createdAt)],
                ["Last updated", fmtDateTime(b.updatedAt)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "7px 0", borderTop: `1px solid ${t.border}` }}>
                  <span style={{ color: t.muted }}>{k}</span><span style={{ textAlign: "right", wordBreak: "break-word" }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card t={t} title="Sales">
              {data.sales === null ? (
                <div style={{ fontSize: 13, color: t.muted }}>Sales figures need the transactions.read permission.</div>
              ) : (
                <>
                  <div style={grid(130)}>
                    <Stat t={t} label="Completed sales" value={fmtNum(data.sales.transactions)} />
                    <Stat t={t} label="Sales volume" value={fmtMoney(data.sales.volume, b.currency)} />
                    <Stat t={t} label="Gross profit" value={fmtMoney(data.sales.grossProfit, b.currency)} />
                  </div>
                  <div style={{ fontSize: 12.5, color: t.muted, marginTop: 10 }}>Last sale: {data.sales.lastSaleAt ? fmtDateTime(data.sales.lastSaleAt) : "none yet"}</div>
                </>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "users" && (
        <Card t={t} style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr>{["Name", "Email", "Role", "Branch", "Status", "Last sign-in", "Joined"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{ROLE[u.role] ?? u.role}</td>
                  <td style={td}>{u.branch?.name ?? "—"}</td>
                  <td style={td}><Badge t={t} tone={u.isActive ? "good" : "bad"}>{u.isActive ? "Active" : "Suspended"}</Badge></td>
                  <td style={td}>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</td>
                  <td style={td}>{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "branches" && (
        <Card t={t} style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr>{["Branch", "Type", "Status", "Sales", "Products stocked", "Created"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.branches.map((br) => (
                <tr key={br.id}>
                  <td style={td}>{br.name}</td>
                  <td style={td}>{br.isMain ? "Main" : "Branch"}</td>
                  <td style={td}><Badge t={t} tone={br.isActive ? "good" : "bad"}>{br.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td style={td}>{fmtNum(br._count.sales)}</td>
                  <td style={td}>{fmtNum(br._count.inventoryLevels)}</td>
                  <td style={td}>{fmtDate(br.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "activity" && (
        data.businessAudit === null ? (
          <Notice t={t} tone="warn">Activity history needs the audit.read permission.</Notice>
        ) : (
          <div style={grid(320)}>
            <Card t={t} title="Platform actions on this business">
              {data.platformAudit.length === 0 ? <div style={{ fontSize: 13, color: t.muted }}>No administrator actions yet.</div> :
                data.platformAudit.map((a) => (
                  <div key={a.id} style={{ fontSize: 13, padding: "8px 0", borderTop: `1px solid ${t.border}` }}>
                    <div style={{ fontWeight: 600 }}>{a.action.replace(/_/g, " ").toLowerCase()}</div>
                    <div style={{ fontSize: 12, color: t.muted }}>{fmtDateTime(a.createdAt)} · {a.actorEmail ?? "system"}</div>
                    {a.reason && <div style={{ fontSize: 12.5, marginTop: 2 }}>Reason: {a.reason}</div>}
                  </div>
                ))}
            </Card>
            <Card t={t} title="Recent activity inside the business">
              {data.businessAudit.length === 0 ? <div style={{ fontSize: 13, color: t.muted }}>No activity recorded yet.</div> :
                data.businessAudit.map((a) => (
                  <div key={a.id} style={{ fontSize: 13, padding: "8px 0", borderTop: `1px solid ${t.border}` }}>
                    <div style={{ fontWeight: 600 }}>{a.action.replace(/_/g, " ").toLowerCase()}</div>
                    <div style={{ fontSize: 12, color: t.muted }}>{fmtDateTime(a.createdAt)}{a.entityType ? ` · ${a.entityType}` : ""}</div>
                  </div>
                ))}
            </Card>
          </div>
        )
      )}

      {dialog?.action === "suspend" && (
        <ConfirmDialog t={t} danger requireReason busy={busy} error={dialogError} confirmLabel="Suspend business"
          title={`Suspend ${b.name}?`}
          body="Everyone in this business is signed out and cannot sign in until it is reactivated. No records are deleted. Open sessions end within 15 minutes."
          onCancel={() => setDialog(null)} onConfirm={(reason) => act({ action: "suspend", reason }, "Business suspended.")} />
      )}
      {dialog?.action === "reactivate" && (
        <ConfirmDialog t={t} requireReason busy={busy} error={dialogError} confirmLabel="Reactivate business"
          title={`Reactivate ${b.name}?`} body="Users of this business will be able to sign in again."
          onCancel={() => setDialog(null)} onConfirm={(reason) => act({ action: "reactivate", reason }, "Business reactivated.")} />
      )}
      {dialog?.action === "set_mode" && (
        <ConfirmDialog t={t} requireReason busy={busy} error={dialogError}
          confirmLabel={`Switch to ${PACKAGE_LABEL[dialog.mode]}`}
          title="Override package?"
          body={`This changes the package for everyone in ${b.name}. Modules outside the package become unavailable; no records are deleted. Insight Store selling still requires an approved seller. The business's audit log will show this change.`}
          onCancel={() => setDialog(null)} onConfirm={(reason) => act({ action: "set_mode", mode: dialog.mode, reason }, "Package changed.")}>
          <label htmlFor="pkg-select" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 5 }}>New package</label>
          <select id="pkg-select" value={dialog.mode} onChange={(e) => setDialog({ ...dialog, mode: e.target.value })} style={{ ...inputStyle(t), marginBottom: 10 }}>
            {Object.entries(PACKAGE_LABEL).filter(([k]) => k !== b.appMode).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </ConfirmDialog>
      )}
      {edit && (
        <ConfirmDialog t={t} requireReason busy={busy} error={dialogError} confirmLabel="Save changes"
          title="Edit business details" body="Changes are recorded in the platform audit log and the business's own audit log."
          onCancel={() => setEdit(null)}
          onConfirm={(reason) => act({ action: "update", name: edit.name, email: edit.email, phone: edit.phone || null, address: edit.address || null, reason }, "Business details updated.")}>
          {[["name", "Business name"], ["email", "Business email"], ["phone", "Phone"], ["address", "Address"]].map(([k, l]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <label htmlFor={`edit-${k}`} style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 5 }}>{l}</label>
              <input id={`edit-${k}`} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} style={inputStyle(t)} />
            </div>
          ))}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function AdminBusinessDetail({ businessId }) {
  return (
    <AdminShell active="/admin/businesses" title="Business details">
      <Detail businessId={businessId} />
    </AdminShell>
  );
}
