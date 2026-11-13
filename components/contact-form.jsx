"use client";
import { useState } from "react";

const primary = "#2E7D32";
const deep = "#145A32";
const field = { width: "100%", padding: "10px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginBottom: 12, fontFamily: "inherit" };

export function ContactForm({ address }) {
  const [v, setV] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [st, setSt] = useState({ busy: false, ok: "", err: "" });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSt({ busy: true, ok: "", err: "" });
    const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res && res.ok) { setSt({ busy: false, ok: data.message || "Thank you.", err: "" }); setV({ name: "", email: "", subject: "", message: "", website: "" }); }
    else setSt({ busy: false, ok: "", err: data.error || "We could not send your message. Please try again." });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0FFF0", padding: 24, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <a href="/" style={{ display: "inline-block", marginBottom: 20 }}><img src="/brand/insight-logo.png" alt="Insight" style={{ width: 120, height: "auto" }} /></a>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 28 }}>
          <h1 style={{ fontSize: 22, color: deep, margin: "0 0 6px" }}>Contact us</h1>
          <p style={{ fontSize: 14, color: "#5B6B63", margin: "0 0 18px" }}>Send us a message, or write to <a href={`mailto:${address}`} style={{ color: primary }}>{address}</a>.</p>
          {st.ok ? (
            <div role="status" style={{ background: "#E8F5E9", color: deep, padding: 14, borderRadius: 8, fontSize: 14 }}>{st.ok}</div>
          ) : (
            <form onSubmit={submit} noValidate>
              <input style={field} placeholder="Your name" value={v.name} onChange={set("name")} maxLength={100} autoComplete="name" />
              <input style={field} type="email" placeholder="Your email address" value={v.email} onChange={set("email")} maxLength={254} autoComplete="email" />
              <input style={field} placeholder="Subject" value={v.subject} onChange={set("subject")} maxLength={150} />
              <textarea style={{ ...field, minHeight: 130, resize: "vertical" }} placeholder="Your message" value={v.message} onChange={set("message")} maxLength={5000} />
              {/* Hidden honeypot: people never see or fill this. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}><input tabIndex={-1} autoComplete="off" value={v.website} onChange={set("website")} placeholder="Website" /></div>
              {st.err && <div role="alert" style={{ color: "#B3261E", background: "#FBE9E7", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{st.err}</div>}
              <button disabled={st.busy} style={{ width: "100%", padding: "11px 0", background: primary, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: st.busy ? 0.7 : 1 }}>{st.busy ? "Sending..." : "Send message"}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
