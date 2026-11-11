"use client";

import React, { useEffect, useState } from "react";
import AdminShell, { useAdmin } from "./admin-shell";
import { Badge, Button, Card, Notice, fmtDate, fmtDateTime, inputStyle } from "./ui";

const PACKAGE_LABEL = { FULL: "Full", INVENTORY_ONLY: "Inventory Only", STORE_INVENTORY: "Store and Inventory", POS_INVENTORY: "POS and Inventory" };

const COLUMNS = [
  { key: "name", label: "Business", sort: "name" },
  { key: "owner", label: "Owner" },
  { key: "created", label: "Registered", sort: "created" },
  { key: "status", label: "Status" },
  { key: "mode", label: "Package" },
  { key: "users", label: "Users", sort: "users" },
  { key: "branches", label: "Branches" },
  { key: "activity", label: "Last activity", sort: "activity" },
];

function Directory() {
  const { t } = useAdmin();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [sort, setSort] = useState({ key: "created", dir: "desc" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = setTimeout(() => { setQuery(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ q: query, status, mode, sort: sort.key, dir: sort.dir, page: String(page), pageSize: "25" });
    fetch(`/api/admin/businesses?${params}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) return setError(body?.error ?? "Could not load businesses.");
        setError("");
        setData(body);
      })
      .catch(() => !cancelled && setError("Couldn't reach the server."));
    return () => { cancelled = true; };
  }, [query, status, mode, sort, page]);

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const select = { ...inputStyle(t), width: "auto" };
  const th = { padding: "10px 12px", fontSize: 11.5, fontWeight: 700, color: t.muted, textAlign: "left", whiteSpace: "nowrap", borderBottom: `1px solid ${t.border}` };
  const td = { padding: "10px 12px", fontSize: 13, borderBottom: `1px solid ${t.border}`, verticalAlign: "top" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input aria-label="Search businesses" placeholder="Search by business name, ID or user email" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle(t), flex: "1 1 260px", maxWidth: 420 }} />
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={select}>
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option>
        </select>
        <select aria-label="Mode" value={mode} onChange={(e) => { setMode(e.target.value); setPage(1); }} style={select}>
          <option value="">All packages</option><option value="FULL">Full</option><option value="INVENTORY_ONLY">Inventory Only</option><option value="STORE_INVENTORY">Store and Inventory</option><option value="POS_INVENTORY">POS and Inventory</option>
        </select>
      </div>

      {error && <Notice t={t}>{error}</Notice>}

      <Card t={t} style={{ padding: 0, overflowX: "auto" }}>
        {!data ? (
          <div style={{ padding: 20, fontSize: 13, color: t.muted }}>Loading businesses…</div>
        ) : data.items.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", fontSize: 13.5, color: t.muted }}>
            {query || status || mode ? "No businesses match these filters." : "No businesses have registered yet."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={th} aria-sort={sort.key === c.sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sort ? (
                      <button onClick={() => toggleSort(c.sort)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>
                        {c.label}{sort.key === c.sort ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                      </button>
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id}>
                  <td style={td}>
                    <a href={`/admin/businesses/${b.id}`} style={{ fontWeight: 600 }}>{b.name}</a>
                    <div style={{ fontSize: 11, color: t.muted, fontFamily: "ui-monospace, Menlo, monospace" }}>{b.id}</div>
                  </td>
                  <td style={td}>{b.owner ? <>{b.owner.name}<div style={{ fontSize: 12, color: t.muted }}>{b.owner.email}</div></> : <span style={{ color: t.muted }}>No owner</span>}</td>
                  <td style={td}>{fmtDate(b.createdAt)}</td>
                  <td style={td}><Badge t={t} tone={b.status === "ACTIVE" ? "good" : "bad"}>{b.status === "ACTIVE" ? "Active" : "Suspended"}</Badge></td>
                  <td style={td}>{PACKAGE_LABEL[b.appMode] ?? b.appMode}</td>
                  <td style={td}>{b.userCount}</td>
                  <td style={td}>{b.branchCount}</td>
                  <td style={td}>{b.lastActivity ? fmtDateTime(b.lastActivity) : <span style={{ color: t.muted }}>None yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {data && data.pagination.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: t.muted, flexWrap: "wrap", gap: 8 }}>
          <span>{data.pagination.total} business{data.pagination.total === 1 ? "" : "es"} · page {data.pagination.page} of {data.pagination.totalPages}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button t={t} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button t={t} disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBusinesses() {
  return (
    <AdminShell active="/admin/businesses" title="Businesses" subtitle="Every business registered on Insight">
      <Directory />
    </AdminShell>
  );
}
