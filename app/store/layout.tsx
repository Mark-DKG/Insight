import type { Metadata } from "next";
import "./store.css";
import { CartBadge } from "@/components/store/store-client";
import { AccountMenu, ShopperGate } from "@/components/store/shopper";
import { publicCategories, storeIsOpen } from "@/lib/store/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Insight Store", template: "%s · Insight Store" },
  description: "Shop products from approved local businesses on Insight Store. Order directly from sellers on WhatsApp.",
};

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [categories, status] = await Promise.all([publicCategories().catch(() => []), storeIsOpen().catch(() => ({ isOpen: true, announcement: null }))]);
  return (
    <div className="st">
      <header className="st-head">
        <div className="st-wrap st-head-row">
          <a href="/store" className="st-logo"><img src="/brand/insight-logo-light.png" alt="Insight" />Store</a>
          <form className="st-search" action="/store/search" method="get" role="search">
            <input name="q" placeholder="Search products and sellers" aria-label="Search products and sellers" maxLength={100} />
            <button type="submit">Search</button>
          </form>
          <AccountMenu />
          <CartBadge />
        </div>
      </header>
      {categories.length > 0 && (
        <nav className="st-cats" aria-label="Categories">
          <div className="st-wrap">
            <a href="/store/search">All products</a>
            {categories.map((c) => <a key={c.id} href={`/store/search?category=${c.slug}`}>{c.name}</a>)}
          </div>
        </nav>
      )}
      {(!status.isOpen || status.announcement) && (
        <div className="st-wrap" style={{ paddingTop: 14 }}>
          <div className="st-note">{status.announcement ?? "Insight Store is not taking new orders right now. You can still browse."}</div>
        </div>
      )}
      <ShopperGate />
      <main className="st-main"><div className="st-wrap">{children}</div></main>
      <footer className="st-foot">
        <div className="st-wrap">
          <span>Insight Store connects you with approved businesses. Orders, payment and delivery are agreed directly with each seller.</span>
          <span>Built by <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer">9DEVs</a></span>
        </div>
      </footer>
    </div>
  );
}
