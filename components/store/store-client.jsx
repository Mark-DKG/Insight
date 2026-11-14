"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Client pieces of the public marketplace: cart badge, add-to-cart, share
// buttons, visit attribution, product gallery, the cart + checkout page and
// the customer order status page.

const money = (n, cur) => `${cur} ${Number(n).toFixed(2)}`;
const imgSrc = (id) => `/api/store/public/images/${id}`;
const CART_EVENT = "insight-store-cart";

async function jsonFetch(url, init) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export function CartBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () => fetch("/api/store/public/cart").then((r) => (r.ok ? r.json() : null)).then((b) => b && setCount(b.count ?? 0)).catch(() => {});
    load();
    const on = (e) => (typeof e.detail === "number" ? setCount(e.detail) : load());
    window.addEventListener(CART_EVENT, on);
    return () => window.removeEventListener(CART_EVENT, on);
  }, []);
  return (
    <a href="/store/cart" className="st-cart" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></svg>
      Cart {count > 0 && <span className="st-badge">{count}</span>}
    </a>
  );
}

export function AddToCart({ listingId, available, disabled = false }) {
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const max = Math.max(0, Math.min(999, available));
  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      const { ok, body } = await jsonFetch("/api/store/public/cart", { method: "POST", body: JSON.stringify({ listingId, quantity: qty }) });
      if (!ok) { setMsg({ ok: false, text: body.error ?? "Couldn't add to cart." }); return; }
      window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: body.count }));
      setMsg({ ok: true, text: "Added to your cart." });
    } catch {
      setMsg({ ok: false, text: "You're offline. Try again when you're connected." });
    } finally {
      setBusy(false);
    }
  }
  if (disabled || max <= 0) return <button className="st-btn" disabled>Out of stock</button>;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="st-qty" aria-label="Quantity">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span>{qty}</span>
          <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(max, q + 1))}>+</button>
        </div>
        <button className="st-btn" onClick={add} disabled={busy}>{busy ? "Adding…" : "Add to cart"}</button>
        {msg?.ok && <a href="/store/cart" style={{ color: "#2E7D32", fontWeight: 700 }}>View cart →</a>}
      </div>
      {msg && <div className={msg.ok ? "st-ok" : "st-err"} style={{ marginTop: 10 }} role="status">{msg.text}</div>}
    </div>
  );
}

export function Gallery({ imageIds, fallback, title }) {
  const [i, setI] = useState(0);
  const srcs = imageIds.length ? imageIds.map(imgSrc) : fallback ? [fallback] : [];
  return (
    <div>
      <div className="st-img" style={{ borderRadius: 10, border: "1px solid #E3E8E4" }}>
        {srcs.length ? <img src={srcs[i]} alt={title} /> : <span>No photo</span>}
      </div>
      {srcs.length > 1 && (
        <div className="st-thumbs">
          {srcs.map((s, n) => (
            <button key={s} className={n === i ? "on" : ""} onClick={() => setI(n)} aria-label={`Photo ${n + 1}`}><img src={s} alt="" /></button>
          ))}
        </div>
      )}
    </div>
  );
}

function track(payload) {
  try {
    fetch("/api/store/public/attribution", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
  } catch {}
}

/** Records a visit that arrived via a shared link (?ref=<channel>). */
export function VisitTracker({ targetType, targetId }) {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    const key = `ist-visit:${targetType}:${targetId}:${ref}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
    track({ channel: ref, event: "VISIT", targetType, targetId });
  }, [targetType, targetId]);
  return null;
}

// Share links use each network's public share URL (or the device share
// sheet). No social network API is called; Insight only counts the taps.
export function ShareButtons({ url, title, targetType, targetId }) {
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  useEffect(() => { setCanNative(typeof navigator !== "undefined" && !!navigator.share); }, []);
  const withRef = (ch) => `${url}${url.includes("?") ? "&" : "?"}ref=${ch}`;
  const open = (ch, href) => { track({ channel: ch, event: "SHARE", targetType, targetId }); window.open(href, "_blank", "noopener,noreferrer"); };
  async function copy(ch = "copy") {
    track({ channel: ch, event: "SHARE", targetType, targetId });
    try { await navigator.clipboard.writeText(withRef(ch)); setCopied(ch); setTimeout(() => setCopied(false), 2500); } catch { window.prompt?.("Copy this link", withRef(ch)); }
  }
  async function native(ch) {
    if (navigator.share) {
      try { await navigator.share({ title, url: withRef(ch) }); track({ channel: ch, event: "SHARE", targetType, targetId }); } catch {}
    } else copy(ch);
  }
  const text = encodeURIComponent(title);
  return (
    <div className="st-share" aria-label="Share">
      <button onClick={() => open("whatsapp", `https://wa.me/?text=${encodeURIComponent(`${title} ${withRef("whatsapp")}`)}`)}>WhatsApp</button>
      <button onClick={() => open("facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withRef("facebook"))}`)}>Facebook</button>
      <button onClick={() => open("x", `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(withRef("x"))}`)}>X</button>
      <button onClick={() => open("telegram", `https://t.me/share/url?url=${encodeURIComponent(withRef("telegram"))}&text=${text}`)}>Telegram</button>
      <button onClick={() => (canNative ? native("instagram") : copy("instagram"))} title="Instagram has no web share link: this copies the link (or opens your device's share sheet) to paste into Instagram.">{copied === "instagram" ? "Link copied" : "Instagram"}</button>
      <button onClick={() => (canNative ? native("tiktok") : copy("tiktok"))} title="TikTok has no web share link: this copies the link (or opens your device's share sheet) to paste into TikTok.">{copied === "tiktok" ? "Link copied" : "TikTok"}</button>
      <button onClick={() => copy("copy")}>{copied === "copy" ? "Link copied" : "Copy link"}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cart and checkout
// ---------------------------------------------------------------------------
function newKey() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`; }
}

export function CartPage({ storeOpen, announcement }) {
  const [cart, setCart] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerEmail: "", deliveryAddress: "", note: "" });
  const [fulfilment, setFulfilment] = useState({});
  const [result, setResult] = useState(null);
  const [key, setKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const { ok, body } = await jsonFetch("/api/store/public/cart");
      if (!ok) { setError(body.error ?? "Your cart could not be loaded."); return; }
      setCart(body);
      window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: body.count }));
    } catch { setError("You're offline. Your cart will load when you're connected."); }
  }, []);
  useEffect(() => {
    load();
    try {
      const saved = JSON.parse(localStorage.getItem("ist-customer") ?? "null");
      if (saved) setForm((f) => ({ ...f, customerName: saved.customerName ?? "", customerPhone: saved.customerPhone ?? "", customerEmail: saved.customerEmail ?? "", deliveryAddress: saved.deliveryAddress ?? "" }));
    } catch {}
    // A signed-in shopper's saved details win over the browser's last guest entry.
    fetch("/api/store/public/account/me", { cache: "no-store" }).then((r) => r.json()).then((b) => {
      const u = b.shopper;
      if (u) setForm((f) => ({ ...f, customerName: u.name || f.customerName, customerPhone: u.phone || f.customerPhone, customerEmail: u.email || f.customerEmail, deliveryAddress: u.defaultAddress || f.deliveryAddress }));
    }).catch(() => {});
  }, [load]);

  const groups = React.useMemo(() => {
    const m = new Map();
    for (const l of cart?.lines ?? []) {
      const g = m.get(l.seller.businessId) ?? { seller: l.seller, lines: [], subtotal: 0, currency: l.currency };
      g.lines.push(l);
      g.subtotal = Math.round((g.subtotal + l.lineTotal) * 100) / 100;
      m.set(l.seller.businessId, g);
    }
    return [...m.values()];
  }, [cart]);

  useEffect(() => {
    setFulfilment((f) => {
      const next = { ...f };
      for (const g of groups) if (!next[g.seller.businessId]) next[g.seller.businessId] = g.seller.offersCollection ? "COLLECTION" : "DELIVERY";
      return next;
    });
  }, [groups]);

  async function setQty(listingId, quantity) {
    setBusy(`q:${listingId}`);
    setError(null);
    const { ok, body } = await jsonFetch("/api/store/public/cart", { method: "PUT", body: JSON.stringify({ listingId, quantity }) }).catch(() => ({ ok: false, body: { error: "You're offline." } }));
    if (!ok) setError(body.error ?? "Couldn't update your cart.");
    else { setCart(body); window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: body.count })); }
    setBusy(null);
  }

  const needsAddress = groups.some((g) => fulfilment[g.seller.businessId] === "DELIVERY");
  const problems = (cart?.lines ?? []).filter((l) => l.problem);

  async function checkout(e) {
    e.preventDefault();
    setBusy("checkout");
    setError(null);
    const idempotencyKey = key ?? newKey();
    setKey(idempotencyKey);
    try {
      localStorage.setItem("ist-customer", JSON.stringify({ customerName: form.customerName, customerPhone: form.customerPhone, customerEmail: form.customerEmail, deliveryAddress: form.deliveryAddress }));
    } catch {}
    try {
      const { ok, body } = await jsonFetch("/api/store/public/checkout", { method: "POST", body: JSON.stringify({ ...form, fulfilment, idempotencyKey }) });
      if (!ok) {
        setError(body.error ?? "Your order could not be placed.");
        if (body.cart) setCart(body.cart);
        setKey(null);
        return;
      }
      setResult(body);
      try {
        const mine = JSON.parse(localStorage.getItem("ist-orders") ?? "[]");
        localStorage.setItem("ist-orders", JSON.stringify([...body.orders.map((o) => ({ reference: o.reference, path: o.statusPath, seller: o.sellerName, at: Date.now() })), ...mine].slice(0, 30)));
      } catch {}
      window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: 0 }));
    } catch {
      // Keep the same key: retrying can't create a duplicate order.
      setError("The connection dropped before we heard back. Tap Place order again — you won't be charged twice or get a duplicate order.");
    } finally {
      setBusy(null);
    }
  }

  if (result) return <CheckoutDone result={result} />;
  if (error && !cart) return <div className="st-err">{error}</div>;
  if (!cart) return <div className="st-mu">Loading your cart…</div>;
  if (cart.lines.length === 0) {
    return (
      <div className="st-panel st-empty">
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1F2937", marginBottom: 6 }}>Your cart is empty</div>
        <div>Browse products from Insight Store sellers and add them here.</div>
        <div style={{ marginTop: 14 }}><a className="st-btn" href="/store">Browse products</a></div>
      </div>
    );
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="st-cart-grid">
      <div>
        {groups.map((g) => (
          <div key={g.seller.businessId} className="st-panel" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <a href={`/store/s/${g.seller.slug}`} style={{ fontWeight: 700 }}>{g.seller.name}</a>
              <span className="st-mu" style={{ fontSize: 12 }}>· separate order</span>
              <div className="st-seg" style={{ marginLeft: "auto" }} role="group" aria-label={`How to receive items from ${g.seller.name}`}>
                <button type="button" className={fulfilment[g.seller.businessId] === "COLLECTION" ? "on" : ""} disabled={!g.seller.offersCollection} onClick={() => setFulfilment((f) => ({ ...f, [g.seller.businessId]: "COLLECTION" }))}>Collect</button>
                <button type="button" className={fulfilment[g.seller.businessId] === "DELIVERY" ? "on" : ""} disabled={!g.seller.offersDelivery} onClick={() => setFulfilment((f) => ({ ...f, [g.seller.businessId]: "DELIVERY" }))}>Delivery</button>
              </div>
            </div>
            {!g.seller.hasWhatsApp && <div className="st-note" style={{ margin: "8px 0" }}>This seller hasn't added a WhatsApp number yet. Your order will still reach them in Insight.</div>}
            {g.lines.map((l) => (
              <div key={l.listingId} className="st-line">
                <a href={`/store/p/${l.listingId}`} className="st-img">{l.imageId ? <img src={imgSrc(l.imageId)} alt="" /> : <span>—</span>}</a>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={`/store/p/${l.listingId}`} style={{ fontWeight: 600 }}>{l.title}</a>
                  <div className="st-mu" style={{ fontSize: 12.5 }}>{money(l.unitPrice, l.currency)} each</div>
                  {l.problem && <div className="st-stock out" style={{ marginTop: 3 }}>{l.problem}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <div className="st-qty">
                      <button type="button" aria-label="Decrease" disabled={!!busy} onClick={() => setQty(l.listingId, Math.max(1, l.quantity - 1))}>−</button>
                      <span>{l.quantity}</span>
                      <button type="button" aria-label="Increase" disabled={!!busy || l.quantity >= l.available} onClick={() => setQty(l.listingId, l.quantity + 1)}>+</button>
                    </div>
                    <button type="button" onClick={() => setQty(l.listingId, 0)} disabled={!!busy} style={{ border: "none", background: "transparent", color: "#B3261E", fontSize: 12.5, cursor: "pointer" }}>Remove</button>
                  </div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{money(l.lineTotal, l.currency)}</div>
              </div>
            ))}
            <div style={{ textAlign: "right", marginTop: 10, fontWeight: 700 }}>Subtotal {money(g.subtotal, g.currency)}</div>
          </div>
        ))}
      </div>

      <form className="st-panel" onSubmit={checkout}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Your details</div>
        <div className="st-mu" style={{ fontSize: 12.5, marginBottom: 14 }}>
          No account or payment needed now. Each seller gets your order request, confirms availability and agrees payment with you on WhatsApp.
        </div>
        <div className="st-field"><label className="st-label" htmlFor="c-name">Full name</label><input id="c-name" className="st-input" required maxLength={120} value={form.customerName} onChange={set("customerName")} autoComplete="name" /></div>
        <div className="st-field"><label className="st-label" htmlFor="c-phone">Phone (WhatsApp)</label><input id="c-phone" className="st-input" required maxLength={40} inputMode="tel" placeholder="024 123 4567" value={form.customerPhone} onChange={set("customerPhone")} autoComplete="tel" /></div>
        <div className="st-field"><label className="st-label" htmlFor="c-email">Email <span className="st-mu" style={{ fontWeight: 500 }}>(optional)</span></label><input id="c-email" className="st-input" type="email" maxLength={160} value={form.customerEmail} onChange={set("customerEmail")} autoComplete="email" /></div>
        {needsAddress && <div className="st-field"><label className="st-label" htmlFor="c-addr">Delivery address</label><textarea id="c-addr" className="st-input" required maxLength={500} rows={3} value={form.deliveryAddress} onChange={set("deliveryAddress")} autoComplete="street-address" /></div>}
        <div className="st-field"><label className="st-label" htmlFor="c-note">Note to sellers <span className="st-mu" style={{ fontWeight: 500 }}>(optional)</span></label><textarea id="c-note" className="st-input" maxLength={500} rows={2} value={form.note} onChange={set("note")} /></div>
        {!storeOpen && <div className="st-note" style={{ marginBottom: 10 }}>{announcement ?? "Insight Store is not taking orders right now."}</div>}
        {error && <div className="st-err" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="st-btn" style={{ width: "100%" }} disabled={busy === "checkout" || problems.length > 0 || !storeOpen}>
          {busy === "checkout" ? "Placing order…" : groups.length > 1 ? `Place ${groups.length} order requests` : "Place order request"}
        </button>
        {problems.length > 0 && <div className="st-mu" style={{ fontSize: 12, marginTop: 8 }}>Fix the items marked above to continue.</div>}
        <div className="st-mu" style={{ fontSize: 11.5, marginTop: 10 }}>By placing an order you share your name, phone and order details with the seller{groups.length > 1 ? "s" : ""} so they can contact you.</div>
      </form>
    </div>
  );
}

function CheckoutDone({ result }) {
  const [opened, setOpened] = useState({});
  function openWa(o) {
    const t = new URLSearchParams(o.statusPath.split("?")[1]).get("t");
    fetch(`/api/store/public/orders/${o.reference}/whatsapp?t=${encodeURIComponent(t)}`, { method: "POST", keepalive: true }).catch(() => {});
    setOpened((x) => ({ ...x, [o.reference]: true }));
    window.open(o.whatsappUrl, "_blank", "noopener,noreferrer");
  }
  return (
    <div className="st-panel" style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>Order request{result.orders.length > 1 ? "s" : ""} placed</div>
      <div className="st-mu" style={{ marginBottom: 14 }}>
        {result.orders.length > 1 ? `Your cart was split into ${result.orders.length} orders, one per seller. ` : ""}
        Send each order to the seller on WhatsApp. Nothing is confirmed until the seller replies, and you don't pay anything through Insight.
      </div>
      {result.orders.map((o) => (
        <div key={o.reference} style={{ border: "1px solid #E3E8E4", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <b>{o.sellerName}</b><span className="st-mu">Order {o.reference}</span>
            <span style={{ marginLeft: "auto", fontWeight: 700 }}>{money(o.subtotal, o.currency)}</span>
          </div>
          <div className="st-mu" style={{ fontSize: 12.5, margin: "4px 0 10px" }}>{o.fulfilment === "DELIVERY" ? "Delivery" : "Collection"} · seller has until {new Date(o.expiresAt).toLocaleString()} to respond</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {o.whatsappUrl ? (
              <button className="st-btn wa" onClick={() => openWa(o)}>{opened[o.reference] ? "Open WhatsApp again" : "Send order on WhatsApp"}</button>
            ) : (
              <span className="st-note">This seller has no WhatsApp number. They will see your request in Insight and contact you.</span>
            )}
            <a className="st-btn ghost" href={o.statusPath}>Track order</a>
          </div>
          {opened[o.reference] && <div className="st-mu" style={{ fontSize: 12, marginTop: 8 }}>Make sure you tap Send in WhatsApp. We can't see whether the message was sent.</div>}
        </div>
      ))}
      <div className="st-mu" style={{ fontSize: 12.5 }}>Keep your tracking links — they're the only way to view these orders without an account. We've also saved them on this device.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer order status
// ---------------------------------------------------------------------------
const STEP_LABEL = {
  PLACED: "Order request placed", CONFIRM: "Seller confirmed the order", REJECT: "Seller declined the order", AWAITING_PAYMENT: "Waiting for payment",
  PAYMENT_RECORDED: "Seller recorded your payment", PROCESSING: "Being prepared", READY: "Ready for collection", DISPATCH: "Dispatched for delivery",
  COMPLETE: "Completed", CANCEL: "Cancelled", EXPIRED: "Expired — the seller didn't respond in time", REFUND_RECORDED: "Seller recorded a refund",
};

export function OrderStatus({ reference }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    let t = new URLSearchParams(window.location.search).get("t");
    if (!t) {
      try { t = new URLSearchParams((JSON.parse(localStorage.getItem("ist-orders") ?? "[]").find((o) => o.reference === reference)?.path ?? "").split("?")[1] ?? "").get("t"); } catch {}
    }
    setToken(t);
    // Without a link token the server only answers for the signed-in owner.
    fetch(`/api/store/public/orders/${encodeURIComponent(reference)}${t ? `?t=${encodeURIComponent(t)}` : ""}`)
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) setError(t ? (b.error ?? "Order not found.") : "Open this page from the tracking link in your order confirmation, or sign in to the account that placed the order."); else setOrder(b.order); })
      .catch(() => setError("You're offline. Connect to see the latest status."));
  }, [reference]);

  if (error) return <div className="st-err">{error}</div>;
  if (!order) return <div className="st-mu">Loading order…</div>;
  const closed = ["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(order.status);
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
      <div className="st-panel">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Order {order.reference}</div>
          <span className="st-pill" style={{ color: closed && order.status !== "COMPLETED" ? "#B3261E" : undefined, borderColor: closed && order.status !== "COMPLETED" ? "#B3261E" : undefined }}>{order.statusLabel}</span>
          <span className="st-mu" style={{ marginLeft: "auto", fontSize: 12.5 }}>Payment: {order.paymentStatus === "PAID" ? "recorded by seller" : order.paymentStatus === "REFUNDED" ? "refunded" : "not recorded yet"}</span>
        </div>
        <div className="st-mu" style={{ marginTop: 4 }}>From <a href={order.seller.slug ? `/store/s/${order.seller.slug}` : "#"} style={{ color: "#2E7D32", fontWeight: 600 }}>{order.seller.name}</a> · {order.fulfilment === "DELIVERY" ? `Delivery to ${order.deliveryAddress ?? "your address"}` : "Collection"}</div>
        {order.status === "NEW" && <div className="st-note" style={{ marginTop: 12 }}>Waiting for the seller to confirm. The request expires {new Date(order.expiresAt).toLocaleString()} if they don't respond.</div>}
        {order.status === "READY_FOR_COLLECTION" && order.seller.collectionInfo && <div className="st-ok" style={{ marginTop: 12 }}>{order.seller.collectionInfo}</div>}
        {!closed && order.whatsappUrl && (
          <div style={{ marginTop: 12 }}>
            <a className="st-btn wa" href={order.whatsappUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => fetch(`/api/store/public/orders/${order.reference}/whatsapp${token ? `?t=${encodeURIComponent(token)}` : ""}`, { method: "POST", keepalive: true }).catch(() => {})}>
              {order.whatsappOpenedAt ? "Message the seller on WhatsApp" : "Send order on WhatsApp"}
            </a>
          </div>
        )}
      </div>
      <div className="st-panel">
        {order.items.map((i, n) => (
          <div key={n} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #E3E8E4" }}>
            <span style={{ flex: 1 }}>{i.quantity} × {i.title}</span><span>{money(i.lineTotal, order.currency)}</span>
          </div>
        ))}
        <div style={{ textAlign: "right", fontWeight: 800, marginTop: 8 }}>Total {money(order.subtotal, order.currency)}</div>
      </div>
      <div className="st-panel">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Progress</div>
        <ul className="st-tl">
          {order.timeline.map((e, n) => (
            <li key={n}><b>{STEP_LABEL[e.action] ?? e.action}</b> <span className="st-mu">· {new Date(e.at).toLocaleString()}</span>{e.note && <div className="st-mu" style={{ marginTop: 2 }}>Reason: {e.note}</div>}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SearchSort({ value }) {
  const router = useRouter();
  return (
    <select className="st-input" aria-label="Sort" value={value ?? ""} onChange={(e) => {
      const u = new URL(window.location.href);
      if (e.target.value) u.searchParams.set("sort", e.target.value); else u.searchParams.delete("sort");
      u.searchParams.delete("page");
      router.push(u.pathname + u.search);
    }}>
      <option value="">Recommended</option>
      <option value="rating">Top rated</option>
      <option value="newest">Newest</option>
      <option value="price_asc">Price: low to high</option>
      <option value="price_desc">Price: high to low</option>
    </select>
  );
}
