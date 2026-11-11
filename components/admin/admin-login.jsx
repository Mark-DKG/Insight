"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ADMIN_THEMES, Button, Notice, inputStyle } from "./ui";

// Two-step admin sign-in: password, then authenticator code. On first
// sign-in the second step is enrolment (add the key to an authenticator app
// and confirm with a code).

export default function AdminLogin() {
  const router = useRouter();
  const t = ADMIN_THEMES.light;
  const [step, setStep] = useState("password"); // password | mfa | enroll
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submitPassword = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body?.error ?? "Sign-in failed.");
      setPassword("");
      setEnrollment(body.enrollment ?? null);
      setStep(body.step);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/mfa", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 && /expired|Start again/.test(body?.error ?? "")) setStep("password");
        return setError(body?.error ?? "Verification failed.");
      }
      router.replace("/admin/dashboard");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 5 };
  return (
    <div style={{ minHeight: "100vh", background: "#111827", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "min(420px, 100%)", background: t.surface, color: t.text, borderRadius: 12, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <ShieldCheck size={22} color={t.accent} />
          <div style={{ fontSize: 17, fontWeight: 700 }}>Insight Platform Admin</div>
        </div>
        <p style={{ fontSize: 13, color: t.muted, margin: "0 0 20px" }}>
          For 9DEVs platform administrators only. Business accounts sign in at <a href="/login" style={{ color: t.accent }}>/login</a>.
        </p>

        {step === "password" && (
          <form onSubmit={submitPassword}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="adm-email" style={label}>Email</label>
              <input id="adm-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle(t)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="adm-password" style={label}>Password</label>
              <input id="adm-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle(t)} />
            </div>
            {error && <div style={{ marginBottom: 12 }}><Notice t={t}>{error}</Notice></div>}
            <Button t={t} kind="primary" type="submit" disabled={busy} style={{ width: "100%", padding: "10px 0" }}>{busy ? "Checking…" : "Continue"}</Button>
          </form>
        )}

        {step === "enroll" && enrollment && (
          <form onSubmit={submitCode}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Set up two-step verification</div>
            <ol style={{ fontSize: 13, color: t.muted, paddingLeft: 18, margin: "0 0 12px", lineHeight: 1.6 }}>
              <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
              <li>Add an account using <strong>"Enter a setup key"</strong>, choose time-based, and paste this key:</li>
            </ol>
            <div style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 14, letterSpacing: 1, wordBreak: "break-all", background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, padding: "10px 12px", marginBottom: 6, userSelect: "all" }}>
              {enrollment.secret.match(/.{1,4}/g).join(" ")}
            </div>
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 14 }}>
              On a phone with the app installed you can also <a href={enrollment.uri} style={{ color: t.accent }}>open the setup link</a>.
            </div>
            <label htmlFor="adm-code" style={label}>Enter the 6-digit code the app shows</label>
            <input id="adm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ ...inputStyle(t), fontSize: 18, letterSpacing: 4, textAlign: "center" }} />
            {error && <div style={{ marginTop: 12 }}><Notice t={t}>{error}</Notice></div>}
            <Button t={t} kind="primary" type="submit" disabled={busy || code.length !== 6} style={{ width: "100%", padding: "10px 0", marginTop: 14 }}>{busy ? "Verifying…" : "Verify and sign in"}</Button>
          </form>
        )}

        {step === "mfa" && (
          <form onSubmit={submitCode}>
            <label htmlFor="adm-code" style={label}>Authenticator code</label>
            <input id="adm-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ ...inputStyle(t), fontSize: 18, letterSpacing: 4, textAlign: "center" }} />
            {error && <div style={{ marginTop: 12 }}><Notice t={t}>{error}</Notice></div>}
            <Button t={t} kind="primary" type="submit" disabled={busy || code.length !== 6} style={{ width: "100%", padding: "10px 0", marginTop: 14 }}>{busy ? "Verifying…" : "Sign in"}</Button>
            <button type="button" onClick={() => { setStep("password"); setCode(""); setError(""); }} style={{ marginTop: 10, background: "none", border: "none", color: t.muted, fontSize: 12.5, cursor: "pointer", width: "100%" }}>
              Use a different account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
