"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Stars } from "./product-card";
import { openAccountPrompt } from "./shopper";

// Reviews on a product page (listingId) or a seller page (seller slug).
// Reading is public. Writing needs a signed-in shopper account with a
// completed order; guests are told how to get one, never shown a form.

const API = "/api/store/public/reviews";

async function call(url, method = "GET", body) {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "You're offline. Try again when you're connected." } };
  }
}

const day = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function StarPicker({ value, onChange }) {
  return (
    <div className="st-rv-pick" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} className={n <= value ? "on" : ""} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

function ReviewForm({ target, mine, onSaved, onCancel }) {
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!rating) { setErr("Choose a rating from 1 to 5 stars."); return; }
    setBusy(true); setErr("");
    const { ok, data } = await call(API, "POST", { ...target, rating, comment: comment.trim() || undefined });
    setBusy(false);
    if (!ok) { setErr(data.error ?? "Couldn't save your review."); return; }
    onSaved();
  }
  return (
    <form onSubmit={submit} className="st-panel" style={{ display: "grid", gap: 10 }}>
      <div className="st-label">{mine ? "Edit your review" : "Your review"}</div>
      <StarPicker value={rating} onChange={setRating} />
      <label className="st-label" htmlFor="rv-comment">Comment (optional)</label>
      <textarea id="rv-comment" className="st-input" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you think? Links aren't allowed." />
      {err && <div className="st-err" role="alert">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="st-btn" disabled={busy}>{busy ? "Saving…" : mine ? "Save changes" : "Post review"}</button>
        {onCancel && <button type="button" className="st-btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function ReportBox({ id, onDone }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { ok, data } = await call(`${API}/${id}/report`, "POST", { reason });
    setBusy(false);
    if (!ok) { setErr(data.error ?? "Couldn't send the report."); return; }
    onDone();
  }
  return (
    <form onSubmit={send} style={{ display: "grid", gap: 6, marginTop: 6 }}>
      <input className="st-input" aria-label="Why are you reporting this review?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why are you reporting this review?" />
      {err && <div className="st-err" role="alert">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}><button className="st-btn" style={{ padding: "7px 12px", fontSize: 13 }} disabled={busy}>Send report</button><button type="button" className="st-btn ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => onDone(true)}>Cancel</button></div>
    </form>
  );
}

export function Reviews({ listingId, seller, title }) {
  const target = listingId ? { listingId } : { seller };
  const q = listingId ? `listingId=${encodeURIComponent(listingId)}` : `seller=${encodeURIComponent(seller)}`;
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [note, setNote] = useState("");
  const load = useCallback(async (p = page) => {
    const { ok, data } = await call(`${API}?${q}&page=${p}`);
    if (ok) setData(data);
  }, [q, page]);
  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A sign-in elsewhere on the page changes what this viewer may do.
    const on = () => load(page);
    window.addEventListener("insight-shopper", on);
    return () => window.removeEventListener("insight-shopper", on);
  }, [load, page]);

  if (!data) return <div className="st-mu" style={{ fontSize: 13 }}>Loading reviews…</div>;
  const { summary, reviews, viewer } = data;
  const pages = Math.ceil(summary.count / data.pageSize);
  const what = listingId ? "product" : "store";

  async function removeMine() {
    if (!viewer.mine) return;
    const { ok } = await call(`${API}/${viewer.mine.id}`, "DELETE");
    if (ok) { setNote("Your review was deleted."); setEditing(false); load(1); setPage(1); }
  }

  return (
    <section className="st-rv" aria-label={`Reviews for this ${what}`}>
      <h2 className="st-h2" style={{ margin: 0 }}>Reviews</h2>
      {summary.count > 0 ? (
        <div className="st-rv-sum">
          <div>
            <div className="st-rv-big">{summary.average.toFixed(1)}</div>
            <Stars average={summary.average} count={summary.count} size={16} showCount={false} />
            <div className="st-mu" style={{ fontSize: 12 }}>{summary.count} review{summary.count === 1 ? "" : "s"}</div>
          </div>
          <div className="st-rv-bars">
            {[5, 4, 3, 2, 1].map((n) => (
              <div className="st-rv-bar" key={n}><span>{n}★</span><i><b style={{ width: `${(summary.distribution[n] / summary.count) * 100}%` }} /></i><span>{summary.distribution[n]}</span></div>
            ))}
          </div>
        </div>
      ) : <div className="st-mu">No reviews yet{viewer.canReview ? ". Be the first." : "."}</div>}

      {note && <div className="st-ok" role="status">{note}</div>}

      {!viewer.signedIn ? (
        <div className="st-panel" style={{ fontSize: 13.5 }}>
          Only signed-in customers with a completed order can review. Guests can read reviews but can't write them.{" "}
          <button type="button" className="st-rv-link" style={{ color: "var(--g)", fontWeight: 700, fontSize: 13.5 }} onClick={() => openAccountPrompt("signin")}>Sign in or create an account</button>
        </div>
      ) : viewer.canReview ? (
        viewer.mine && !editing ? (
          <div className="st-panel" style={{ fontSize: 13.5, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span>Your review: <Stars average={viewer.mine.rating} count={1} size={14} showCount={false} /></span>
            {viewer.mine.status === "VISIBLE"
              ? <><button type="button" className="st-rv-link" onClick={() => setEditing(true)}>Edit</button><button type="button" className="st-rv-link" onClick={removeMine}>Delete</button></>
              : <span className="st-mu">Removed by moderators.</span>}
          </div>
        ) : (
          <ReviewForm target={target} mine={viewer.mine} onCancel={viewer.mine ? () => setEditing(false) : null}
            onSaved={() => { setEditing(false); setNote(viewer.mine ? "Your review was updated." : "Thanks, your review is live."); setPage(1); load(1); }} />
        )
      ) : (
        <div className="st-panel st-mu" style={{ fontSize: 13.5 }}>{viewer.reason}</div>
      )}

      <div>
        {reviews.map((r) => (
          <article className="st-rv-item" key={r.id}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Stars average={r.rating} count={1} size={14} showCount={false} />
              <b style={{ fontSize: 13.5 }}>{r.displayName}</b>
              <span className="st-mu" style={{ fontSize: 12 }}>{day(r.createdAt)}{r.edited ? " (edited)" : ""}</span>
            </div>
            {r.comment && <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 14 }}>{r.comment}</div>}
            {r.sellerReply && <div className="st-rv-reply"><b>Reply from the seller</b> <span className="st-mu" style={{ fontSize: 12 }}>{r.sellerRepliedAt ? day(r.sellerRepliedAt) : ""}</span><div style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{r.sellerReply}</div></div>}
            {viewer.signedIn && !(viewer.mine && viewer.mine.id === r.id) && (
              reporting === r.id
                ? <ReportBox id={r.id} onDone={(cancelled) => { setReporting(null); if (!cancelled) setNote("Thanks, we'll take a look."); }} />
                : <div><button type="button" className="st-rv-link" onClick={() => setReporting(r.id)}>Report</button></div>
            )}
          </article>
        ))}
      </div>
      {pages > 1 && (
        <div className="st-pager">
          {page > 1 && <a href="#reviews" onClick={(e) => { e.preventDefault(); setPage(page - 1); }}>← Newer</a>}
          <span className="st-mu" style={{ alignSelf: "center" }}>Page {page} of {pages}</span>
          {page < pages && <a href="#reviews" onClick={(e) => { e.preventDefault(); setPage(page + 1); }}>Older →</a>}
        </div>
      )}
    </section>
  );
}
