"use client";

import React, { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import AdminShell, { useAdmin } from "./admin-shell";
import { Badge, Card, Notice, Stat, fmtDate, fmtMoney, fmtNum } from "./ui";

const RANGES = [
  { days: 7, label: "7 days", granularity: "day" },
  { days: 30, label: "30 days", granularity: "day" },
  { days: 90, label: "90 days", granularity: "week" },
  { days: 365, label: "12 months", granularity: "month" },
  { days: 1825, label: "5 years", granularity: "year" },
];

function mergeTrends(trends, granularity) {
  const keyed = new Map();
  const add = (series, field) =>
    (series ?? []).forEach((p) => {
      const k = new Date(p.bucket).toISOString();
      keyed.set(k, { ...(keyed.get(k) ?? { bucket: k }), [field]: p.count });
    });
  add(trends.businessRegistrations, "businesses");
  add(trends.userRegistrations, "users");
  add(trends.transactions, "transactions");
  const fmt = (iso) => {
    const d = new Date(iso);
    if (granularity === "year") return String(d.getUTCFullYear());
    if (granularity === "month") return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };
  return [...keyed.values()]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((r) => ({ label: fmt(r.bucket), businesses: r.businesses ?? 0, users: r.users ?? 0, transactions: r.transactions ?? 0 }));
}

function Dashboard() {
  const { t } = useAdmin();
  const [range, setRange] = useState(RANGES[1]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch(`/api/admin/dashboard?days=${range.days}&granularity=${range.granularity}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) return setError(body?.error ?? "Could not load the dashboard.");
        setData(body);
      })
      .catch(() => !cancelled && setError("Couldn't reach the server."));
    return () => { cancelled = true; };
  }, [range]);

  const rangeSwitch = (
    <div role="group" aria-label="Date range" style={{ display: "flex", border: `1px solid ${t.border}`, borderRadius: 6, overflow: "hidden" }}>
      {RANGES.map((r) => (
        <button key={r.days} onClick={() => setRange(r)} aria-pressed={range.days === r.days}
          style={{ padding: "6px 10px", fontSize: 12.5, border: "none", cursor: "pointer", fontWeight: 600, background: range.days === r.days ? t.accent : "transparent", color: range.days === r.days ? "#fff" : t.text }}>
          {r.label}
        </button>
      ))}
    </div>
  );

  if (error) return <Notice t={t}>{error}</Notice>;
  if (!data) return <div style={{ color: t.muted, fontSize: 14 }}>Loading platform figures…</div>;

  const b = data.businesses, u = data.users, a = data.activity, inf = data.infrastructure;
  const chart = mergeTrends(data.trends, data.range.granularity);
  const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: t.muted }}>"New" figures cover the last {range.label}.</div>
        {rangeSwitch}
      </div>

      {data.alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.alerts.map((al, i) => <Notice key={i} t={t} tone={al.severity === "info" ? "warn" : "bad"}>{al.message}</Notice>)}
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Businesses</div>
        <div style={grid(150)}>
          <Stat t={t} label="Registered" value={fmtNum(b.total)} sub={`${fmtNum(b.newInRange)} new`} />
          <Stat t={t} label="Active" value={fmtNum(b.active)} />
          <Stat t={t} label="Suspended" value={fmtNum(b.suspended)} />
          <Stat t={t} label="Full Functionality" value={fmtNum(b.full)} />
          <Stat t={t} label="Inventory Only" value={fmtNum(b.inventoryOnly)} />
          <Stat t={t} label="Branches" value={fmtNum(b.branches)} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Users</div>
        <div style={grid(150)}>
          <Stat t={t} label="Registered users" value={fmtNum(u.total)} sub={`${fmtNum(u.newInRange)} new`} />
          <Stat t={t} label="Active accounts" value={fmtNum(u.active)} />
          <Stat t={t} label="Suspended accounts" value={fmtNum(u.suspended)} />
          <Stat t={t} label="Active sessions" value={fmtNum(u.activeSessions)} sub="unexpired refresh tokens" />
          <Stat t={t} label="Signed in, last 24 h" value={fmtNum(u.loggedInLast24h)} />
        </div>
      </div>

      <div style={grid(320)}>
        <Card t={t} title="Activity trend">
          {chart.length === 0 ? (
            <div style={{ fontSize: 13, color: t.muted, padding: "24px 0" }}>No registrations or sales in this period yet.</div>
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: t.muted }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: t.muted }} />
                  <Tooltip contentStyle={{ background: t.surface, border: `1px solid ${t.border}`, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="businesses" name="New businesses" stroke="#2E7D32" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="users" name="New users" stroke="#1F6FB2" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="transactions" name="Sales" stroke="#B7791F" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card t={t} title="Business activity">
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 10 }}>
            Sales volume is what businesses sold to their customers. It is not 9DEVs revenue; no billing data exists yet.
          </div>
          <div style={grid(130)}>
            <Stat t={t} label="Completed sales" value={fmtNum(a.transactionsInRange)} sub={`last ${range.label}`} />
            <Stat t={t} label="Active products" value={fmtNum(a.activeProducts)} />
            <Stat t={t} label="Customers" value={fmtNum(a.customers)} />
            <Stat t={t} label="Suppliers" value={fmtNum(a.suppliers)} />
          </div>
          <div style={{ marginTop: 12 }}>
            {a.salesVolumeByCurrency === null ? (
              <div style={{ fontSize: 12.5, color: t.muted }}>Sales volume needs the transactions.read permission.</div>
            ) : a.salesVolumeByCurrency.length === 0 ? (
              <div style={{ fontSize: 12.5, color: t.muted }}>No completed sales in this period.</div>
            ) : (
              a.salesVolumeByCurrency.map((c) => (
                <div key={c.currency} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0", borderTop: `1px solid ${t.border}` }}>
                  <span>Sales volume ({c.currency})</span>
                  <strong>{fmtMoney(c.volume, c.currency)}</strong>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div style={grid(320)}>
        <Card t={t} title="Recent business registrations" action={<a href="/admin/businesses" style={{ fontSize: 12.5 }}>View all</a>}>
          {data.recentBusinesses.length === 0 ? (
            <div style={{ fontSize: 13, color: t.muted }}>No businesses have registered yet.</div>
          ) : (
            data.recentBusinesses.map((r) => (
              <a key={r.id} href={`/admin/businesses/${r.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 0", borderTop: `1px solid ${t.border}`, textDecoration: "none", color: t.text }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.owner?.email ?? "No owner"}</span>
                </span>
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <Badge t={t} tone={r.status === "ACTIVE" ? "good" : "bad"}>{r.status === "ACTIVE" ? "Active" : "Suspended"}</Badge>
                  <span style={{ display: "block", fontSize: 11.5, color: t.muted, marginTop: 3 }}>{fmtDate(r.createdAt)}</span>
                </span>
              </a>
            ))
          )}
        </Card>

        <Card t={t} title="Infrastructure">
          {[
            ["API", <Badge key="a" t={t} tone="good">Responding</Badge>],
            ["Database", <Badge key="d" t={t} tone={inf.database.status === "ok" ? "good" : "warn"}>{inf.database.status === "ok" ? "Connected" : "Slow"} · {inf.database.latencyMs} ms</Badge>],
            ["Database size", `${(inf.database.sizeBytes / 1024 / 1024).toFixed(1)} MB`],
            ["Failed admin sign-ins (24 h)", fmtNum(inf.authentication.adminLoginFailures24h)],
            ["Failed business sign-ins (24 h)", fmtNum(inf.authentication.businessLoginFailures24h)],
            ["Background jobs", <span key="j" style={{ color: t.muted }}>None configured</span>],
            ["HTTP error rate", <span key="e" style={{ color: t.muted }}>Not instrumented yet</span>],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "7px 0", borderTop: `1px solid ${t.border}` }}>
              <span style={{ color: t.muted }}>{k}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: t.muted, marginTop: 8 }}>{inf.synchronization.note}</div>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminShell active="/admin/dashboard" title="Platform dashboard" subtitle="All businesses on Insight">
      <Dashboard />
    </AdminShell>
  );
}
