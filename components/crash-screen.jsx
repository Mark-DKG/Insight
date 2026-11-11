"use client";

import React from "react";

// Shown instead of a blank "Application error" page whenever a screen
// crashes. Keeps the person inside the app with clear ways forward.
export default function CrashScreen({ onRetry }) {
  const btn = {
    padding: "10px 18px", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: "pointer",
    fontFamily: "inherit",
  };
  return (
    <div
      role="alert"
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        background: "#F0FFF0", color: "#1F2937",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#145A32", marginBottom: 6 }}>Insight</div>
        <h1 style={{ fontSize: 19, margin: "0 0 8px" }}>This screen ran into a problem</h1>
        <p style={{ fontSize: 14, color: "#5B6B63", margin: "0 0 20px", lineHeight: 1.5 }}>
          Your data is safe — nothing was lost or changed. The problem has been reported automatically.
          Try loading the screen again, or go to another part of the app.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onRetry} style={{ ...btn, border: "none", background: "#2E7D32", color: "#fff" }}>
            Try again
          </button>
          <button onClick={() => { window.location.href = "/inventory"; }} style={{ ...btn, border: "1px solid #E5E7EB", background: "transparent", color: "#1F2937" }}>
            Go to Inventory
          </button>
          <button onClick={() => { window.location.href = "/settings"; }} style={{ ...btn, border: "1px solid #E5E7EB", background: "transparent", color: "#1F2937" }}>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
