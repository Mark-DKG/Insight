"use client";
import { useEffect, useState } from "react";

const primary = "#2E7D32";
const deep = "#145A32";
const honeydew = "#F0FFF0";

function Shell({ title, children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: honeydew, padding: 24, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <img src="/brand/insight-logo.png" alt="Insight" style={{ width: 128, height: "auto" }} />
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: deep, marginBottom: 14 }}>{title}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

const input = { width: "100%", padding: "10px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginBottom: 14 };
const button = { width: "100%", padding: "11px 0", background: primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" };

export function ResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState({ busy: false, error: "", done: "" });
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) return setState({ busy: false, error: "Password must be at least 8 characters.", done: "" });
    if (password !== confirm) return setState({ busy: false, error: "The two passwords do not match.", done: "" });
    setState({ busy: true, error: "", done: "" });
    const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res && res.ok) setState({ busy: false, error: "", done: data.message || "Your password was changed." });
    else setState({ busy: false, error: data.error || "Something went wrong. Please try again.", done: "" });
  }

  if (!token) return <Shell title="Reset password"><p style={{ fontSize: 14, color: "#1F2937" }}>This reset link is missing its code. Request a new link from the sign-in page.</p><a href="/login" style={{ color: primary, fontWeight: 600, fontSize: 14 }}>Go to sign in</a></Shell>;
  if (state.done) return <Shell title="Password changed"><p style={{ fontSize: 14, color: "#1F2937" }}>{state.done}</p><a href="/login" style={{ color: primary, fontWeight: 700, fontSize: 14 }}>Go to sign in</a></Shell>;
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit}>
        <input style={input} type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input style={input} type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {state.error && <div role="alert" style={{ color: "#B3261E", background: "#FBE9E7", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{state.error}</div>}
        <button style={{ ...button, opacity: state.busy ? 0.7 : 1 }} disabled={state.busy}>{state.busy ? "Saving..." : "Change password"}</button>
      </form>
    </Shell>
  );
}

export function VerifyEmail() {
  const [state, setState] = useState({ phase: "working", message: "" });
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) return setState({ phase: "error", message: "This confirmation link is missing its code." });
    fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => setState(ok ? { phase: "done", message: data.message } : { phase: "error", message: data.error || "Could not confirm your email." }))
      .catch(() => setState({ phase: "error", message: "Could not reach the server. Please try again." }));
  }, []);
  return (
    <Shell title={state.phase === "done" ? "Email confirmed" : state.phase === "error" ? "Could not confirm" : "Confirming your email"}>
      <p style={{ fontSize: 14, color: "#1F2937" }}>{state.phase === "working" ? "One moment..." : state.message}</p>
      <a href="/login" style={{ color: primary, fontWeight: 700, fontSize: 14 }}>Go to sign in</a>
    </Shell>
  );
}

export function ForgotPassword({ onBack, defaultEmail = "" }) {
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState({ busy: false, done: "", error: "" });
  async function submit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setState({ busy: false, done: "", error: "Enter a valid email address." });
    setState({ busy: true, done: "", error: "" });
    const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res && res.ok) setState({ busy: false, done: data.message, error: "" });
    else setState({ busy: false, done: "", error: "Something went wrong. Please try again." });
  }
  return (
    <Shell title="Reset your password">
      {state.done ? (
        <p style={{ fontSize: 14, color: "#1F2937" }}>{state.done}</p>
      ) : (
        <form onSubmit={submit}>
          <p style={{ fontSize: 13.5, color: "#5B6B63", marginTop: 0 }}>Enter the email address you sign in with and we will send you a link.</p>
          <input style={input} type="email" autoComplete="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          {state.error && <div role="alert" style={{ color: "#B3261E", background: "#FBE9E7", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{state.error}</div>}
          <button style={{ ...button, opacity: state.busy ? 0.7 : 1 }} disabled={state.busy}>{state.busy ? "Sending..." : "Send reset link"}</button>
        </form>
      )}
      <button type="button" onClick={onBack} style={{ marginTop: 14, background: "transparent", border: "none", color: primary, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0 }}>Back to sign in</button>
    </Shell>
  );
}
