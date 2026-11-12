"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, ShoppingBag, ShoppingCart, Store, Check, Clock } from "lucide-react";
import { APPROVAL_WINDOW } from "../lib/store/application-rules";

// Shown once, right after a new owner signs up. Until a package is chosen the
// business runs on the most restricted one (inventory only), enforced on the
// server. Packages that include Insight Store lock the whole dashboard until the
// seller application is approved; only the application screen is reachable.

const GREEN = "#2E7D32";
const DARK = "#145A32";

const PACKAGES = [
  { key: "INVENTORY_ONLY", title: "Inventory Only", Icon: Boxes, store: false,
    text: "Standalone inventory management.", has: ["Products, categories and stock levels", "Suppliers and purchases"], lacks: ["POS and sales", "Insight Store"] },
  { key: "POS_INVENTORY", title: "POS and Inventory", Icon: ShoppingCart, store: false,
    text: "Run your counter and your stock.", has: ["Everything in Inventory", "Point of Sale, sales, customers and expenses", "Profit and loss, analytics, cashier shifts"], lacks: ["Insight Store"] },
  { key: "STORE_INVENTORY", title: "Store and Inventory", Icon: ShoppingBag, store: true,
    text: "Sell on the Insight Store marketplace.", has: ["Everything in Inventory", "Insight Store listings and customer orders"], lacks: ["POS and sales"] },
  { key: "FULL", title: "Full", Icon: Store, store: true,
    text: "Everything Insight offers.", has: ["Inventory, POS and sales management", "Insight Store selling", "All reports and analytics"], lacks: [] },
];

export default function ChoosePackage() {
  const router = useRouter();
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/business/mode")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b?.locked) setReady(true); // waiting for approval: may still switch to a package that needs none
        else if (b?.packageSelected) router.replace("/dashboard");
        else setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  const choice = PACKAGES.find((p) => p.key === picked);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/business/mode", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: picked, confirm: true }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.error ?? "Couldn't save your choice. Try again."); setBusy(false); return; }
      // Store packages go straight to the seller application; the rest go to the app.
      router.push(body.pending ? "/apply" : picked === "INVENTORY_ONLY" ? "/inventory" : "/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0FFF0", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "32px 16px", color: "#1B2A21" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <img src="/brand/insight-logo.png" alt="Insight" style={{ width: 148, height: "auto", display: "block", margin: "0 auto 18px" }} />
        <h1 style={{ margin: "0 0 8px", fontSize: 26, textAlign: "center", color: DARK }}>Choose your package</h1>
        <p style={{ margin: "0 auto 26px", maxWidth: 560, textAlign: "center", color: "#5B6B63", lineHeight: 1.55, fontSize: 14.5 }}>
          Pick the parts of Insight your business needs. You can change this later in Settings, and your records are never deleted when you do.
        </p>

        {!ready ? <div style={{ textAlign: "center", color: "#5B6B63" }}>Loading…</div> : (
          <>
            <div role="radiogroup" aria-label="Package" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {PACKAGES.map(({ key, title, text, Icon, has, lacks, store }) => {
                const on = picked === key;
                return (
                  <button key={key} role="radio" aria-checked={on} onClick={() => { setPicked(key); setError(""); }}
                    style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", background: on ? "#E7F5EA" : "#fff", border: `2px solid ${on ? GREEN : "#D5E3D8"}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon size={18} color={on ? GREEN : "#5B6B63"} />
                      <span style={{ fontSize: 15.5, fontWeight: 700 }}>{title}</span>
                      {on && <Check size={16} color={GREEN} style={{ marginLeft: "auto" }} />}
                    </div>
                    <div style={{ fontSize: 13, color: "#5B6B63" }}>{text}</div>
                    <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12.5, lineHeight: 1.6 }}>
                      {has.map((h) => <li key={h}>{h}</li>)}
                    </ul>
                    {lacks.length > 0 && <div style={{ fontSize: 12, color: "#7B8B83" }}>Not included: {lacks.join(", ")}</div>}
                    {store && (
                      <div style={{ marginTop: "auto", display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#8A5A00", background: "#FFF7E6", border: "1px solid #F0D9A8", borderRadius: 8, padding: "7px 9px" }}>
                        <Clock size={13} style={{ marginTop: 2, flexShrink: 0 }} /> Needs seller approval: {APPROVAL_WINDOW}.
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {choice?.store && (
              <div role="note" style={{ marginTop: 18, background: "#fff", border: "1px solid #F0D9A8", borderLeft: "4px solid #B7791F", borderRadius: 8, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6 }}>
                <b>Insight Store access isn't automatic.</b> You'll fill in a short seller application and upload your documents, then wait for the Insight Store team to approve it. Approval takes {APPROVAL_WINDOW}.
                {" "}Until then your dashboard stays locked: you'll only see the application. Everything in the {choice.title} package switches on once you're approved. Need to start working today? Choose a package without Insight Store instead.
              </div>
            )}

            {error && <div role="alert" style={{ marginTop: 14, color: "#B3261E", background: "#FBE9E7", borderRadius: 8, padding: "10px 12px", fontSize: 13.5 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <button onClick={confirm} disabled={!picked || busy}
                style={{ background: picked ? GREEN : "#B7C7BB", color: "#fff", border: 0, borderRadius: 999, padding: "13px 34px", fontSize: 15, fontWeight: 700, cursor: picked && !busy ? "pointer" : "default" }}>
                {busy ? "Saving…" : choice?.store ? "Continue to the seller application" : "Continue"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
