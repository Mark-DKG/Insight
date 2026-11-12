"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Pause, Play } from "lucide-react";
import { SHOWCASE_PRODUCTS } from "../../lib/landing/products";

// The landing hero: one supplied product at a time, large on the left, its
// name and details on the right, advancing on a fixed 15 second cadence.
//
// Product photographs are shown exactly as supplied — never rotated, skewed or
// perspective-warped. Depth comes only from a soft cast shadow, a spotlight
// behind the product, a slow float and gentle pointer parallax (translation
// only). Under prefers-reduced-motion everything degrades to a plain
// crossfade; the 15 second cadence itself is preserved and can be paused.

const INTERVAL_MS = 15000;

export default function Showcase() {
  const products = SHOWCASE_PRODUCTS;
  const count = products.length;
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0); // bumps on every manual action → restarts the timer
  const [paused, setPaused] = useState(false);
  const [move, setMove] = useState({ x: 0, y: 0 });
  const stage = useRef(null);
  const touch = useRef(null);

  const go = useCallback(
    (next) => {
      setActive(((next % count) + count) % count);
      setTick((t) => t + 1);
    },
    [count]
  );
  const step = useCallback((d) => go(active + d), [active, go]);

  // One timer at a time. The effect re-runs whenever the slide changes (auto
  // or manual), the visitor pauses/resumes, or a manual action bumps `tick`,
  // and its cleanup clears the pending timeout first — so timers can neither
  // overlap nor outlive the component.
  useEffect(() => {
    if (paused || count < 2) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearTimeout(id);
  }, [active, tick, paused, count]);

  // Deep link: /?product=<id> opens that slide.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("product");
    const i = id ? products.findIndex((p) => p.id === id) : -1;
    if (i >= 0) setActive(i);
  }, [products]);

  // Arrow keys while focus is inside the showcase.
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

  function onMove(e) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    setMove({
      x: Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width - 0.5)),
      y: Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height - 0.5)),
    });
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="lp-stage">
      <section
        className="lp-show"
        ref={stage}
        tabIndex={-1}
        aria-roledescription="carousel"
        aria-label="Featured products"
        onMouseMove={onMove}
        onMouseLeave={() => setMove({ x: 0, y: 0 })}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 46) step(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        {/* Spotlight behind the product, one layer per slide, crossfaded. */}
        <div className="lp-spot" aria-hidden="true">
          {products.map((q, i) => (
            <div
              key={q.id}
              className={`lp-spot-layer${i === active ? " on" : ""}`}
              style={{ background: `radial-gradient(52% 64% at 30% 52%, ${q.glow}, transparent 72%)` }}
            />
          ))}
        </div>

        {/* Product — left / centre. */}
        <div className="lp-product">
          <div
            className="lp-parallax"
            style={{ transform: `translate3d(${(-move.x * 14).toFixed(1)}px, ${(-move.y * 9).toFixed(1)}px, 0)` }}
          >
            {products.map((q, i) => {
              const rel = i === active ? 0 : ((i - active + count) % count) > count / 2 ? -1 : 1;
              return (
                <figure
                  key={q.id}
                  className={`lp-item${i === active ? " on" : ""}`}
                  style={{ "--dx": rel * 9 }}
                  aria-hidden={i !== active}
                >
                  <img
                    src={q.image}
                    alt={q.alt}
                    width={q.w}
                    height={q.h}
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    decoding="async"
                    draggable="false"
                  />
                </figure>
              );
            })}
          </div>
        </div>

        {/* Product name and information — right. */}
        <div className="lp-info" aria-live="polite" aria-atomic="true">
          {products.map((q, i) => (
            <div key={q.id} className={`lp-info-item${i === active ? " on" : ""}`} aria-hidden={i !== active}>
              <div className="lp-eyebrow">
                <span>{pad(i + 1)}</span> / {pad(count)} &nbsp;·&nbsp; Insight Store
              </div>
              <h2 className="lp-title">{q.title}</h2>
              <div className="lp-type">{q.type}</div>
              <div className="lp-rule" />
              {q.description && <p className="lp-desc">{q.description}</p>}
              {q.price && <div className="lp-price">{q.price}</div>}
              <a className="lp-discover" href={q.href || "/store"} tabIndex={i === active ? 0 : -1}>
                <span className="lp-disc-ico"><ArrowRight size={16} /></span>
                <span>
                  <span className="lp-disc-main">Discover in Insight Store</span>
                  <span className="lp-disc-sub">Browse the marketplace</span>
                </span>
              </a>
            </div>
          ))}
        </div>

        {/* Edge strip: the colour of the current product, no imagery. */}
        <div className="lp-edge" aria-hidden="true">
          {products.map((q, i) => (
            <div
              key={q.id}
              className={`lp-edge-layer${i === active ? " on" : ""}`}
              style={{ background: q.accent }}
            />
          ))}
        </div>

        {/* Controls: pagination bottom-left, arrows bottom-right. */}
        <div className="lp-dots" role="tablist" aria-label="Choose a product">
          {products.map((q, i) => (
            <button
              key={q.id}
              className="lp-dot"
              role="tab"
              aria-selected={i === active}
              aria-label={`Show ${q.title}`}
              onClick={() => go(i)}
            >
              <span />
            </button>
          ))}
          <span className="lp-prog" aria-hidden="true">
            <i
              key={`${active}-${tick}-${paused}`}
              style={{ animationDuration: `${INTERVAL_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
            />
          </span>
        </div>

        <div className="lp-ctrl">
          <button className="lp-arrow" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Resume slideshow" : "Pause slideshow"}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <span className="lp-ctrl-sep" aria-hidden="true" />
          <button className="lp-arrow" onClick={() => step(-1)} aria-label="Previous product" disabled={count < 2}>
            <ChevronLeft size={18} />
          </button>
          <button className="lp-arrow" onClick={() => step(1)} aria-label="Next product" disabled={count < 2}>
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="lp-intro" aria-label="About Insight">
        <h1 className="lp-h1">
          Run the shop. Sell to the <em>street</em>.
        </h1>
        <p className="lp-lede">
          Insight keeps your stock, your counter and your marketplace listings on one set of
          numbers — so what you sell in store and what you sell online never disagree about what
          is left on the shelf.
        </p>
        <div className="lp-cta-row">
          <a className="lp-btn lp-btn-light lp-btn-lg" href="/register">
            Get Started <ArrowRight size={16} />
          </a>
          <a className="lp-btn lp-btn-ghost lp-btn-lg" href="/store">Visit Insight Store</a>
        </div>
      </section>

    </div>
  );
}
