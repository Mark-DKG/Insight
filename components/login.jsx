"use client";

import { ForgotPassword } from "./auth-email";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

const LOGO_FULL = "/brand/insight-logo.png";

export default function InsightLogin({ initialMode = "login" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode); // login | register
  const [forgot, setForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const primary = "#2E7D32";
  const deep = "#145A32";
  const honeydew = "#F0FFF0";
  const charcoal = "#1F2937";
  const lightGray = "#E5E7EB";

  const inputWrap = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: `1px solid ${lightGray}`,
    borderRadius: 6,
    padding: "11px 13px",
    background: "#FFFFFF",
  };
  const input = {
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    color: charcoal,
    width: "100%",
  };
  const label = { fontSize: 12.5, fontWeight: 600, color: charcoal, marginBottom: 6, display: "block" };
  const fieldWrap = { marginBottom: 16 };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (mode === "register" && (!businessName || !ownerName)) {
      setError("Enter your business name and your name.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const registerRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessName, ownerName, email, password }),
        });
        const registerBody = await registerRes.json().catch(() => ({}));
        if (!registerRes.ok) {
          setError(registerBody?.error ?? "Could not create the account.");
          setLoading(false);
          return;
        }
      }

      // Registration doesn't start a session by itself, so log in
      // immediately afterward with the same credentials for a smooth flow.
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await loginRes.json().catch(() => ({}));

      if (!loginRes.ok) {
        setError(loginBody?.error ?? "Incorrect email or password.");
        setLoading(false);
        return;
      }

      // New accounts choose their package first; returning users go to the dashboard
      // (the dashboard sends anyone who still has to choose a package to /choose-package).
      router.push(mode === "register" ? "/choose-package" : "/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  if (forgot) return <ForgotPassword onBack={() => setForgot(false)} defaultEmail={email} />;

  return (
    <div
      style={{
        minHeight: "600px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: honeydew,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <img
            src={LOGO_FULL}
            alt="Insight"
            style={{ width: 148, height: "auto", display: "block" }}
          />
        </div>

        <div
          style={{
            background: "#FFFFFF",
            border: `1px solid ${lightGray}`,
            borderRadius: 10,
            padding: 28,
            boxShadow: "0 1px 3px rgba(20,90,50,0.06)",
          }}
        >
          <div style={{ display: "flex", marginBottom: 22, borderBottom: `1px solid ${lightGray}` }}>
            {[
              { key: "login", label: "Log In" },
              { key: "register", label: "Create Business Account" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 13.5,
                  fontWeight: 600,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: mode === t.key ? primary : "#5B6B63",
                  borderBottom: mode === t.key ? `2px solid ${primary}` : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <div style={fieldWrap}>
                <label style={label}>Business Name</label>
                <div style={inputWrap}>
                  <input
                    style={input}
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Riverside Mart"
                  />
                </div>
              </div>
              <div style={fieldWrap}>
                <label style={label}>Your Name</label>
                <div style={inputWrap}>
                  <input
                    style={input}
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Owusu Ansah"
                  />
                </div>
              </div>
            </>
          )}
          <div style={fieldWrap}>
            <label style={label}>Email Address</label>
            <div style={inputWrap}>
              <Mail size={15} color="#5B6B63" />
              <input
                style={input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
              />
            </div>
          </div>

          <div style={{ ...fieldWrap, marginBottom: 8 }}>
            <label style={label}>Password</label>
            <div style={inputWrap}>
              <Lock size={15} color="#5B6B63" />
              <input
                style={input}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", color: "#5B6B63" }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {mode === "login" && (
            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <button type="button" onClick={() => setForgot(true)} style={{ background: "transparent", border: "none", color: primary, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: "9px 12px",
                borderRadius: 6,
                background: "#FBE9E7",
                color: "#B3261E",
                fontSize: 12.5,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "none",
              borderRadius: 7,
              padding: "12px 0",
              background: primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.75 : 1,
              marginTop: mode === "register" ? 6 : 0,
            }}
          >
            {loading ? (
              <Loader2 size={15} className="spin" style={{ animation: "spin 0.8s linear infinite" }} />
            ) : (
              <>
                {mode === "login" ? "Log In" : "Create Account"}
                <ArrowRight size={15} />
              </>
            )}
          </button>
          </form>
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11.5, color: "#5B6B63" }}>
          Built by{" "}
          <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 600 }}>
            9DEVs
          </a>
        </div>
      </div>
    </div>
  );
}
