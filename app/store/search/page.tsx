import type { Metadata } from "next";
import { searchCatalog, publicCategories } from "@/lib/store/public";
import { ProductGrid } from "@/components/store/product-card";
import { SearchSort } from "@/components/store/store-client";

export const dynamic = "force-dynamic";
type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const q = one(searchParams.q);
  return { title: q ? `“${q.slice(0, 60)}”` : "All products" };
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const q = one(searchParams.q)?.slice(0, 100);
  const category = one(searchParams.category);
  const sort = one(searchParams.sort);
  const inStock = one(searchParams.inStock) === "1";
  const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const page = Math.max(1, Math.floor(num(one(searchParams.page)) ?? 1));
  const [result, categories] = await Promise.all([
    searchCatalog({ q, category, sort, inStock, minPrice: num(one(searchParams.min)), maxPrice: num(one(searchParams.max)), page }),
    publicCategories(),
  ]);
  const cat = categories.find((c) => c.slug === category);
  const pages = Math.ceil(result.total / result.pageSize);
  const link = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) { const x = one(v); if (x && k !== "page") u.set(k, x); }
    if (p > 1) u.set("page", String(p));
    return `/store/search${u.toString() ? `?${u}` : ""}`;
  };
  return (
    <>
      <h1 className="st-h1">{q ? `Results for “${q}”` : cat ? cat.name : "All products"}</h1>
      <div className="st-mu">{result.total} product{result.total === 1 ? "" : "s"}</div>
      <form className="st-filters" method="get" action="/store/search">
        {q && <input type="hidden" name="q" value={q} />}
        <div><label className="st-label" htmlFor="f-cat">Category</label>
          <select id="f-cat" name="category" className="st-input" defaultValue={category ?? ""}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select></div>
        <div><label className="st-label" htmlFor="f-min">Min price</label><input id="f-min" name="min" type="number" min="0" step="0.01" className="st-input" style={{ width: 110 }} defaultValue={one(searchParams.min)} /></div>
        <div><label className="st-label" htmlFor="f-max">Max price</label><input id="f-max" name="max" type="number" min="0" step="0.01" className="st-input" style={{ width: 110 }} defaultValue={one(searchParams.max)} /></div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, paddingBottom: 9 }}><input type="checkbox" name="inStock" value="1" defaultChecked={inStock} /> In stock only</label>
        {sort && <input type="hidden" name="sort" value={sort} />}
        <button className="st-btn" type="submit" style={{ padding: "9px 14px" }}>Apply</button>
        <div style={{ marginLeft: "auto" }}><label className="st-label">Sort</label><SearchSort value={sort} /></div>
      </form>
      {result.items.length ? <ProductGrid items={result.items} /> : (
        <div className="st-panel st-empty">No products match. Try a different search or remove some filters.</div>
      )}
      {pages > 1 && (
        <div className="st-pager">
          {page > 1 && <a href={link(page - 1)}>← Previous</a>}
          <span className="st-mu" style={{ alignSelf: "center" }}>Page {page} of {pages}</span>
          {page < pages && <a href={link(page + 1)}>Next →</a>}
        </div>
      )}
    </>
  );
}
