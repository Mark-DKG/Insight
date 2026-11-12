"use client";

import React, { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "../../lib/landing/nav";

// The classic Insight header: logo, pill navigation, Sign In / Get Started.
// It stays pinned to the top of the viewport for the whole page so navigation
// is always one tap away, on desktop and on phones alike.
export default function LandingHeader({ signedIn = false }) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // Close the mobile menu with Escape, and stop the page scrolling behind it.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [menu]);

  return (
    <>
      <header className={`lp-head${scrolled ? " is-scrolled" : ""}`}>
        <a className="lp-brand" href="/" aria-label="Insight home">
          <img src="/brand/insight-logo-light.png" alt="Insight" width={260} height={249} />
        </a>

        <nav className="lp-nav" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} aria-current={l.href === "/" ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="lp-acts">
          {signedIn ? (
            <a className="lp-btn lp-btn-primary" href="/dashboard">Go to Dashboard</a>
          ) : (
            <>
              <a className="lp-btn lp-btn-ghost lp-hide-sm" href="/login">Sign In</a>
              <a className="lp-btn lp-btn-primary" href="/register">Get Started</a>
            </>
          )}
          <button className="lp-burger" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu}>
            <Menu size={18} />
          </button>
        </div>
      </header>

      {menu && (
        <div className="lp-sheet" role="dialog" aria-modal="true" aria-label="Menu" onClick={() => setMenu(false)}>
          <div className="lp-sheet-in" onClick={(e) => e.stopPropagation()}>
            <div className="lp-sheet-hd">
              <img src="/brand/insight-logo-light.png" alt="Insight" style={{ height: 30, width: "auto" }} />
              <button className="lp-arrow" onClick={() => setMenu(false)} aria-label="Close menu">
                <X size={17} />
              </button>
            </div>
            <nav aria-label="Mobile">
              {NAV_LINKS.map((l) => (
                <a key={l.label} href={l.href} onClick={() => setMenu(false)}>{l.label}</a>
              ))}
            </nav>
            <div className="lp-cta-row">
              {signedIn ? (
                <a className="lp-btn lp-btn-primary lp-btn-lg" href="/dashboard">Go to Dashboard</a>
              ) : (
                <>
                  <a className="lp-btn lp-btn-ghost lp-btn-lg" href="/login">Sign In</a>
                  <a className="lp-btn lp-btn-primary lp-btn-lg" href="/register">Get Started</a>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
