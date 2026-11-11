"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Menu, X, ArrowRight } from "lucide-react";
import { SHOWCASE_PRODUCTS, productTitle } from "../../lib/landing/products";

// The interactive part of the landing page: the accent backdrop, the dark
// panel, the header, and the product showcase itself.
//
// Depth here is CSS 3D — perspective, translate3d and rotateY on layered
// elements, plus pointer parallax and a contact shadow. The supplied products
// are photographs, not models, so there is no WebGL scene and nothing claims
// to be one; this renders everywhere, costs no extra bundle, and degrades to a
// plain image when motion is reduced.

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Insight Store", href: "/store" },
  { label: "About Us", href: "/#about" },
];

const AUTOPLAY_MS = 7000;

export default function Showcase({ signedIn = false }) {
  const products = SHOWCASE_PRODUCTS;
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const stage = useRef(null);
  const touch = useRef(null);
  const userMoved = useRef(false);

  const count = products.length;
  const go = useCallback(
    (next, byUser = true) => {
      if (byUser) userMoved.current = true;
      setActive((i) => ((next ?? i) + count) % count);
    },
    [count]
  );
  const step = useCallback((d) => go((active + d + count) % count), [active, count, go]);

  // Deep link: /?product=<id> opens that slide.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("product");
    if (!id) return;
    const i = products.findIndex((p) => p.id === id);
    if (i >= 0) { userMoved.current = true; setActive(i); }
  }, [products]);

  // Keyboard navigation while the showcase has focus within it.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [step]);

  // Autoplay: only while visible, unpaused, and never after the visitor has
  // taken control of the showcase themselves.
  useEffect(() => {
    if (paused || userMoved.current || count < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setActive((i) => (i + 1) % count);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, count, active]);

  // Pointer parallax on the product.
  function onMove(e) {
    const el = stage.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: Math.max(-1, Math.min(1, px)), y: Math.max(-1, Math.min(1, py)) });
  }

  const p = products[active];
  const chips = [p.category, p.sku && `Ref ${p.sku}`, p.price].filter(Boolean);

  return (
    <div
      className="lp-stage"
      style={{ "--accent": p.accent, "--accent-deep": p.accentDeep, "--glow": p.glow }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); setTilt({ x: 0, y: 0 }); }}
    >
      <div className="lp-bg" aria-hidden="true">
        {products.map((q, i) => (
          <div
            key={q.id}
            className={`lp-bg-layer${i === active ? " on" : ""}`}
            style={{ backgroundImage: `linear-gradient(152deg, ${q.accent} 0%, ${q.accentDeep} 72%)` }}
          />
        ))}
      </div>

      <div className="lp-panel">
        <header className="lp-head">
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

        <div
          className="lp-show"
          ref={stage}
          tabIndex={-1}
          onMouseMove={onMove}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touch.current == null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            if (Math.abs(dx) > 46) step(dx < 0 ? 1 : -1);
            touch.current = null;
          }}
        >
          <div className="lp-copy">
            <div className="lp-arrows">
              <button className="lp-arrow" onClick={() => step(-1)} aria-label="Previous product" disabled={count < 2}>
                <ChevronLeft size={17} />
              </button>
              <button className="lp-arrow" onClick={() => step(1)} aria-label="Next product" disabled={count < 2}>
                <ChevronRight size={17} />
              </button>
            </div>
            <h1 className="lp-h1">
              Run the shop.<br />Sell to the <em>street</em>.
            </h1>
            <p className="lp-lede">
              Insight keeps your stock, your counter and your marketplace listings on one
              set of numbers — so what you sell in store and what you sell online never
              disagree about what is left on the shelf.
            </p>
            <div className="lp-cta-row">
              <a className="lp-btn lp-btn-light lp-btn-lg" href="/register">
                Get Started <ArrowRight size={16} />
              </a>
              <a className="lp-btn lp-btn-ghost lp-btn-lg" href="/store">Visit Insight Store</a>
            </div>
          </div>

          <div className="lp-stageview">
            <div
              className="lp-tilt"
              style={{ transform: `rotateY(${tilt.x * 9}deg) rotateX(${-tilt.y * 6}deg) translateZ(0)` }}
            >
              <div className="lp-slot">
                <div className="lp-glow" aria-hidden="true" />
                {products.map((q, i) => {
                  const rel = i - active;
                  return (
                    <figure
                      key={q.id}
                      className={`lp-item${i === active ? " on" : ""}`}
                      style={{ "--x": `${rel * 58}%`, "--ry": `${rel > 0 ? -16 : 16}deg` }}
                      aria-hidden={i !== active}
                    >
                      <img
                        src={q.image}
                        alt={q.alt}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        draggable="false"
                      />
                    </figure>
                  );
                })}
                <div className="lp-floor" aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="lp-meta">
            <div aria-live="polite">
              <div className="lp-eyebrow">Featured on Insight Store</div>
              <div className="lp-pname">{productTitle(p)}</div>
              <div className="lp-ptype">{p.type}</div>
            </div>

            {chips.length > 0 && (
              <div className="lp-chips">
                {chips.map((c) => <span className="lp-chip" key={c}>{c}</span>)}
              </div>
            )}

            {p.href && (
              <a className="lp-btn lp-btn-light" href={p.href}>
                View product <ArrowRight size={15} />
              </a>
            )}

            <div className="lp-thumbs" role="tablist" aria-label="Choose a product">
              {products.map((q, i) => (
                <button
                  key={q.id}
                  className="lp-thumb"
                  role="tab"
                  aria-current={i === active}
                  aria-selected={i === active}
                  aria-label={productTitle(q)}
                  onClick={() => go(i)}
                >
                  <img src={q.image} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
            <div className="lp-count">{active + 1} / {count}</div>
          </div>
        </div>

        <p className="lp-tagline">
          Products listed by approved Insight Store sellers. Stock shown on the marketplace
          is the stock in their Insight inventory.
        </p>
      </div>

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
    </div>
  );
}
