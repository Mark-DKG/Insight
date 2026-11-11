import { featuredListings, featuredSellers, publicCategories } from "@/lib/store/public";
import { ProductGrid } from "@/components/store/product-card";

export const dynamic = "force-dynamic";

export default async function StoreHome() {
  const [items, sellers, categories] = await Promise.all([featuredListings(16), featuredSellers(8), publicCategories()]);
  return (
    <>
      <section className="st-hero">
        <h1>Shop local businesses on Insight Store</h1>
        <p>Browse products from approved sellers, add them to one cart, and send each seller your order on WhatsApp. No account needed.</p>
      </section>

      {categories.length > 0 && (
        <>
          <h2 className="st-h2">Categories</h2>
          <div className="st-share">
            {categories.map((c) => <a key={c.id} href={`/store/search?category=${c.slug}`}>{c.name}</a>)}
          </div>
        </>
      )}

      <h2 className="st-h2">Latest products <a href="/store/search?sort=newest">See all</a></h2>
      {items.length ? <ProductGrid items={items} /> : (
        <div className="st-panel st-empty">No products are listed yet. Approved sellers' products will appear here as soon as they're published.</div>
      )}

      {sellers.length > 0 && (
        <>
          <h2 className="st-h2">Featured sellers</h2>
          <div className="st-grid">
            {sellers.map((s) => (
              <a key={s.slug} href={`/store/s/${s.slug}`} className="st-card">
                <div className="st-card-body">
                  <div className="st-card-title">{s.business.name}</div>
                  <div className="st-seller">{[s.city, s.region].filter(Boolean).join(", ")}</div>
                  {s.description && <div className="st-mu" style={{ fontSize: 12.5 }}>{s.description.slice(0, 90)}{s.description.length > 90 ? "…" : ""}</div>}
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
