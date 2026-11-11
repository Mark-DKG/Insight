import type { PublicListing } from "@/lib/store/public";

export const money = (n: number, cur: string) => `${cur} ${n.toFixed(2)}`;

export function stockLabel(available: number) {
  if (available <= 0) return { cls: "out", text: "Out of stock" };
  if (available <= 5) return { cls: "low", text: `Only ${available} left` };
  return { cls: "ok", text: "In stock" };
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
        <div className="st-seller">{item.seller.name}{item.seller.city ? ` · ${item.seller.city}` : ""}</div>
        <div className={`st-stock ${s.cls}`}>{s.text}</div>
      </div>
    </a>
  );
}

export function ProductGrid({ items }: { items: PublicListing[] }) {
  return <div className="st-grid">{items.map((i) => <ProductCard key={i.id} item={i} />)}</div>;
}
