import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicListing, searchCatalog } from "@/lib/store/public";
import { requestOrigin } from "@/lib/store/origin";
import { money, stockLabel, ProductGrid } from "@/components/store/product-card";
import { AddToCart, Gallery, ShareButtons, VisitTracker } from "@/components/store/store-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await publicListing(params.id);
  if (!item) return { title: "Product not found" };
  const origin = requestOrigin();
  const image = item.imageIds[0] ? `${origin}/api/store/public/images/${item.imageIds[0]}` : item.fallbackImageUrl ?? undefined;
  const description = `${money(item.price, item.currency)} from ${item.seller.name}. ${item.description?.slice(0, 140) ?? "Order on Insight Store."}`;
  return {
    title: item.title,
    description,
    alternates: { canonical: `${origin}/store/p/${item.id}` },
    openGraph: { type: "website", siteName: "Insight Store", title: item.title, description, url: `${origin}/store/p/${item.id}`, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title: item.title, description, images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const item = await publicListing(params.id);
  if (!item) notFound();
  const origin = requestOrigin();
  const s = stockLabel(item.available);
  const more = (await searchCatalog({ seller: item.seller.slug, pageSize: 9 })).items.filter((i) => i.id !== item.id).slice(0, 8);
  return (
    <>
      <VisitTracker targetType="listing" targetId={item.id} />
      <div className="st-mu" style={{ fontSize: 12.5, marginBottom: 12 }}>
        <a href="/store">Insight Store</a>{item.category ? <> › <a href={`/store/search?category=${item.category.slug}`}>{item.category.name}</a></> : null}
      </div>
      <div className="st-prod">
        <Gallery imageIds={item.imageIds} fallback={item.fallbackImageUrl} title={item.title} />
        <div>
          <h1 className="st-h1">{item.title}</h1>
          <div className="st-price" style={{ fontSize: 24, margin: "6px 0" }}>{money(item.price, item.currency)}</div>
          <div className={`st-stock ${s.cls}`} style={{ fontSize: 13, marginBottom: 14 }}>{s.text}</div>
          <AddToCart listingId={item.id} available={item.available} />
          <div className="st-panel" style={{ marginTop: 18 }}>
            <div className="st-mu" style={{ fontSize: 12 }}>Sold by</div>
            <a href={`/store/s/${item.seller.slug}`} style={{ fontWeight: 700, fontSize: 15, color: "#145A32" }}>{item.seller.name}</a>
            <div className="st-mu" style={{ fontSize: 12.5, marginTop: 2 }}>
              {[item.seller.city, item.seller.region].filter(Boolean).join(", ")}
              {(item.seller.offersCollection || item.seller.offersDelivery) && " · "}
              {[item.seller.offersCollection && "Collection", item.seller.offersDelivery && "Delivery"].filter(Boolean).join(" and ")}
            </div>
          </div>
          {item.description && <div style={{ marginTop: 18, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{item.description}</div>}
          <div style={{ marginTop: 20 }}>
            <div className="st-label">Share this product</div>
            <ShareButtons url={`${origin}/store/p/${item.id}`} title={`${item.title} — ${money(item.price, item.currency)} on Insight Store`} targetType="listing" targetId={item.id} />
          </div>
        </div>
      </div>
      {more.length > 0 && (
        <>
          <h2 className="st-h2">More from {item.seller.name} <a href={`/store/s/${item.seller.slug}`}>Visit seller</a></h2>
          <ProductGrid items={more} />
        </>
      )}
    </>
  );
}
