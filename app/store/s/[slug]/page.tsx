import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicSeller, searchCatalog } from "@/lib/store/public";
import { requestOrigin } from "@/lib/store/origin";
import { ProductGrid } from "@/components/store/product-card";
import { ShareButtons, VisitTracker } from "@/components/store/store-client";

export const dynamic = "force-dynamic";
type SP = { [k: string]: string | string[] | undefined };

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const s = await publicSeller(params.slug);
  if (!s) return { title: "Seller not found" };
  const origin = requestOrigin();
  const description = s.description?.slice(0, 160) ?? `Shop ${s.business.name} on Insight Store.`;
  return {
    title: s.business.name, description,
    alternates: { canonical: `${origin}/store/s/${s.slug}` },
    openGraph: { type: "website", siteName: "Insight Store", title: s.business.name, description, url: `${origin}/store/s/${s.slug}` },
  };
}

export default async function SellerPage({ params, searchParams }: { params: { slug: string }; searchParams: SP }) {
  const s = await publicSeller(params.slug);
  if (!s) notFound();
  const origin = requestOrigin();
  const page = Math.max(1, Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) || 1);
  const result = await searchCatalog({ seller: s.slug, page });
  const pages = Math.ceil(result.total / result.pageSize);
  return (
    <>
      <VisitTracker targetType="seller" targetId={s.slug} />
      <div className="st-panel" style={{ marginBottom: 18 }}>
        <h1 className="st-h1">{s.business.name}</h1>
        <div className="st-mu">{[s.city, s.region, s.country].filter(Boolean).join(", ")} · Insight Store seller since {new Date(s.approvedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
        {s.description && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{s.description}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, fontSize: 13, marginTop: 10 }}>
          {s.openingHours && <div><div className="st-label">Opening hours</div><div style={{ whiteSpace: "pre-wrap" }}>{s.openingHours}</div></div>}
          {s.offersCollection && <div><div className="st-label">Collection</div><div>{s.collectionInfo ?? "Available"}</div></div>}
          {s.offersDelivery && <div><div className="st-label">Delivery</div><div>{s.deliveryInfo ?? "Available"}</div></div>}
          {(s.publicPhone || s.publicEmail) && <div><div className="st-label">Contact</div>{s.publicPhone && <div>{s.publicPhone}</div>}{s.publicEmail && <div>{s.publicEmail}</div>}</div>}
        </div>
        <div style={{ marginTop: 14 }}>
          <ShareButtons url={`${origin}/store/s/${s.slug}`} title={`${s.business.name} on Insight Store`} targetType="seller" targetId={s.slug} />
        </div>
      </div>
      <h2 className="st-h2">Products ({result.total})</h2>
      {result.items.length ? <ProductGrid items={result.items} /> : <div className="st-panel st-empty">This seller has no products listed right now.</div>}
      {pages > 1 && (
        <div className="st-pager">
          {page > 1 && <a href={`/store/s/${s.slug}?page=${page - 1}`}>← Previous</a>}
          <span className="st-mu" style={{ alignSelf: "center" }}>Page {page} of {pages}</span>
          {page < pages && <a href={`/store/s/${s.slug}?page=${page + 1}`}>Next →</a>}
        </div>
      )}
    </>
  );
}
