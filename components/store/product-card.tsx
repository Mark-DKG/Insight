import type { PublicListing } from "@/lib/store/public";

export const money = (n: number, cur: string) => `${cur} ${n.toFixed(2)}`;

export function stockLabel(available: number) {
  if (available <= 0) return { cls: "out", text: "Out of stock" };
  if (available <= 5) return { cls: "low", text: `Only ${available} left` };
  return { cls: "ok", text: "In stock" };
}

/** Read-only star row. Partial stars round to the nearest half; the text names the exact value for screen readers. */
export function Stars({ average, count, size = 14, showCount = true }: { average: number; count: number; size?: number; showCount?: boolean }) {
  const star = (i: number) => {
    const fill = Math.max(0, Math.min(1, average - i));
    const id = `sg${i}-${Math.round(average * 10)}-${size}`;
    return (
      <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs><linearGradient id={id}><stop offset={`${fill * 100}%`} stopColor="#E0A100" /><stop offset={`${fill * 100}%`} stopColor="#D5DBD6" /></linearGradient></defs>
        <path fill={`url(#${id})`} d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
      </svg>
    );
  };
  return (
    <span className="st-stars" role="img" aria-label={count ? `Rated ${average.toFixed(1)} out of 5 from ${count} review${count === 1 ? "" : "s"}` : "No reviews yet"}>
      {[0, 1, 2, 3, 4].map(star)}
      {showCount && <span className="st-stars-n">{count ? `${average.toFixed(1)} (${count})` : "No reviews yet"}</span>}
    </span>
  );
}

export function ProductCard({ item }: { item: PublicListing }) {
  const s = stockLabel(item.available);
  const src = item.imageIds[0] ? `/api/store/public/images/${item.imageIds[0]}` : item.fallbackImageUrl;
  return (
    <a href={`/store/p/${item.id}`} className="st-card">
      <div className="st-img">{src ? <img src={src} alt={item.title} loading="lazy" /> : <span>No photo</span>}</div>
      <div className="st-card-body">
        <div className="st-card-title">{item.title}</div>
        <div className="st-price">{money(item.price, item.currency)}</div>
        {item.rating && <Stars average={item.rating.average} count={item.rating.count} size={12} />}
        <div className="st-seller">{item.seller.name}{item.seller.city ? ` · ${item.seller.city}` : ""}</div>
        <div className={`st-stock ${s.cls}`}>{s.text}</div>
      </div>
    </a>
  );
}

export function ProductGrid({ items }: { items: PublicListing[] }) {
  return <div className="st-grid">{items.map((i) => <ProductCard key={i.id} item={i} />)}</div>;
}
