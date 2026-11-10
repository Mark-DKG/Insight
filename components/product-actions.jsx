"use client";

import React, { useState, useEffect } from "react";

// Edit / adjust stock / transfer / remove for one product. Rendered inside
// the Inventory detail panel. Every action calls the live API and reports
// the server's own error message on failure.

const ADJUST_TYPES = [
  { key: "STOCK_IN", label: "Stock in (add)" },
  { key: "STOCK_OUT", label: "Stock out (remove)" },
  { key: "DAMAGED", label: "Damaged (remove)" },
  { key: "EXPIRED", label: "Expired (remove)" },
  { key: "RETURNED", label: "Returned to stock (add)" },
  { key: "COUNT_CORRECTION", label: "Physical count (set to counted quantity)" },
];

export default function ProductActions({ product, session, theme, onChanged, onRemoved }) {
  const [mode, setMode] = useState(null); // edit | adjust | transfer | remove
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [branches, setBranches] = useState([]);

  const [edit, setEdit] = useState({});
  const [adjust, setAdjust] = useState({ type: "STOCK_IN", quantity: "", reason: "" });
  const [transfer, setTransfer] = useState({ toBranchId: "", quantity: "", note: "" });

  const primary = "#2E7D32";
  const bad = "#B3261E";
  const canWrite = session?.role === "OWNER" || session?.role === "MANAGER";

  useEffect(() => {
    setMode(null);
    setError("");
    setDone("");
    setEdit({
      name: product.name,
      costPrice: String(product.cost),
      sellingPrice: String(product.price),
      minStockLevel: String(product.min ?? 0),
      unit: product.unit ?? "Unit",
    });
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.branches && setBranches(b.branches))
      .catch(() => {});
  }, []);

  const input = {
    width: "100%", boxSizing: "border-box", border: `1px solid ${theme.border}`, borderRadius: 6,
    padding: "8px 11px", fontSize: 13, background: "transparent", color: theme.text, marginBottom: 10,
  };
  const label = { fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 };
  const btn = (bg, color, border) => ({
    flex: 1, padding: "9px 0", borderRadius: 6, border: border ? `1px solid ${border}` : "none",
    background: bg, color, fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: busy ? 0.7 : 1,
  });

  async function call(url, method, payload, successText, after) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "The change could not be saved.");
        return;
      }
      setDone(successText);
      setMode(null);
      after?.();
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const saveEdit = () => {
    const cost = Number(edit.costPrice), price = Number(edit.sellingPrice), min = Number(edit.minStockLevel);
    if (!edit.name.trim()) return setError("Product name is required.");
    if ([cost, price, min].some((n) => Number.isNaN(n) || n < 0)) return setError("Prices and minimum stock must be zero or more.");
    call(`/api/products/${product.id}`, "PATCH",
      { name: edit.name.trim(), costPrice: cost, sellingPrice: price, minStockLevel: Math.round(min), unit: edit.unit || "Unit" },
      "Product updated.", onChanged);
  };

  const saveAdjust = () => {
    const qty = Number(adjust.quantity);
    if (!Number.isInteger(qty) || qty < 0 || (qty === 0 && adjust.type !== "COUNT_CORRECTION")) {
      return setError("Enter a whole number quantity.");
    }
    if (!session?.branchId) return setError("Could not determine your branch. Refresh the page.");
    const payload = { productId: product.id, branchId: session.branchId, type: adjust.type, reason: adjust.reason || undefined };
    if (adjust.type === "COUNT_CORRECTION") payload.countedQuantity = qty;
    else payload.quantity = qty;
    call("/api/inventory/adjust", "POST", payload, "Stock updated.", () => {
      setAdjust({ type: "STOCK_IN", quantity: "", reason: "" });
      onChanged?.();
    });
  };

  const saveTransfer = () => {
    const qty = Number(transfer.quantity);
    if (!Number.isInteger(qty) || qty <= 0) return setError("Enter a whole number quantity.");
    if (!transfer.toBranchId) return setError("Choose the branch to send stock to.");
    call("/api/inventory/transfer", "POST",
      { productId: product.id, fromBranchId: session.branchId, toBranchId: transfer.toBranchId, quantity: qty, note: transfer.note || undefined },
      "Transfer recorded.", () => {
        setTransfer({ toBranchId: "", quantity: "", note: "" });
        onChanged?.();
      });
  };

  const otherBranches = branches.filter((b) => b.id !== session?.branchId);

  if (!canWrite) {
    return <div style={{ fontSize: 12.5, color: theme.textMuted }}>Only owners and managers can edit products or adjust stock.</div>;
  }

  return (
    <div>
      {done && <div role="status" style={{ fontSize: 12.5, color: primary, marginBottom: 10 }}>{done}</div>}
      {error && <div role="alert" style={{ fontSize: 12.5, color: bad, marginBottom: 10 }}>{error}</div>}

      {!mode && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button style={btn(primary, "#fff")} onClick={() => { setMode("edit"); setError(""); setDone(""); }}>Edit Product</button>
            <button style={btn("transparent", theme.text, theme.border)} onClick={() => { setMode("adjust"); setError(""); setDone(""); }}>Adjust Stock</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("transparent", theme.text, theme.border)} onClick={() => { setMode("transfer"); setError(""); setDone(""); }}>Transfer</button>
            <button style={btn("transparent", bad, bad)} onClick={() => { setMode("remove"); setError(""); setDone(""); }}>Remove</button>
          </div>
        </>
      )}

      {mode === "edit" && (
        <div>
          <label style={label} htmlFor="pa-name">Name</label>
          <input id="pa-name" style={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={label} htmlFor="pa-cost">Cost price</label>
              <input id="pa-cost" type="number" min="0" step="0.01" style={input} value={edit.costPrice} onChange={(e) => setEdit({ ...edit, costPrice: e.target.value })} />
            </div>
            <div>
              <label style={label} htmlFor="pa-price">Selling price</label>
              <input id="pa-price" type="number" min="0" step="0.01" style={input} value={edit.sellingPrice} onChange={(e) => setEdit({ ...edit, sellingPrice: e.target.value })} />
            </div>
            <div>
              <label style={label} htmlFor="pa-min">Minimum stock</label>
              <input id="pa-min" type="number" min="0" step="1" style={input} value={edit.minStockLevel} onChange={(e) => setEdit({ ...edit, minStockLevel: e.target.value })} />
            </div>
            <div>
              <label style={label} htmlFor="pa-unit">Unit</label>
              <input id="pa-unit" style={input} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("transparent", theme.text, theme.border)} onClick={() => setMode(null)} disabled={busy}>Cancel</button>
            <button style={btn(primary, "#fff")} onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      {mode === "adjust" && (
        <div>
          <label style={label} htmlFor="pa-type">Type</label>
          <select id="pa-type" style={input} value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value })}>
            {ADJUST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <label style={label} htmlFor="pa-qty">{adjust.type === "COUNT_CORRECTION" ? `Counted quantity (system shows ${product.qty})` : "Quantity"}</label>
          <input id="pa-qty" type="number" min="0" step="1" style={input} value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })} />
          <label style={label} htmlFor="pa-reason">Reason (optional)</label>
          <input id="pa-reason" style={input} value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} placeholder="e.g. Broken in transit" />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("transparent", theme.text, theme.border)} onClick={() => setMode(null)} disabled={busy}>Cancel</button>
            <button style={btn(primary, "#fff")} onClick={saveAdjust} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      {mode === "transfer" && (
        <div>
          {otherBranches.length === 0 ? (
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 10 }}>
              You need a second branch before you can transfer stock.
            </div>
          ) : (
            <>
              <label style={label} htmlFor="pa-to">Send to branch</label>
              <select id="pa-to" style={input} value={transfer.toBranchId} onChange={(e) => setTransfer({ ...transfer, toBranchId: e.target.value })}>
                <option value="">Choose a branch</option>
                {otherBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <label style={label} htmlFor="pa-tqty">Quantity (in stock here: {product.qty})</label>
              <input id="pa-tqty" type="number" min="1" step="1" style={input} value={transfer.quantity} onChange={(e) => setTransfer({ ...transfer, quantity: e.target.value })} />
              <label style={label} htmlFor="pa-note">Note (optional)</label>
              <input id="pa-note" style={input} value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} />
            </>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("transparent", theme.text, theme.border)} onClick={() => setMode(null)} disabled={busy}>Cancel</button>
            {otherBranches.length > 0 && (
              <button style={btn(primary, "#fff")} onClick={saveTransfer} disabled={busy}>{busy ? "Saving…" : "Transfer"}</button>
            )}
          </div>
        </div>
      )}

      {mode === "remove" && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Remove {product.name}?</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
            It disappears from the POS and product list. Past sales and stock history are kept.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("transparent", theme.text, theme.border)} onClick={() => setMode(null)} disabled={busy}>Cancel</button>
            <button style={btn(bad, "#fff")} disabled={busy}
              onClick={() => call(`/api/products/${product.id}`, "DELETE", null, "Product removed.", onRemoved)}>
              {busy ? "Removing…" : "Remove product"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
