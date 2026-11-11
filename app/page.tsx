import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./landing.css";
import Showcase, { NAV_LINKS } from "@/components/landing/showcase";
import { siteOrigin } from "@/lib/store/origin";
import { verifyAccessToken } from "@/lib/jwt";

export const dynamic = "force-dynamic";

const TITLE = "Insight — Inventory, Point of Sale and Marketplace for Retail";
const DESC =
  "Insight runs your stock, your counter and your Insight Store listings on one set of numbers. " +
  "Built for retail businesses that sell in store and online.";

export async function generateMetadata(): Promise<Metadata> {
  const origin = siteOrigin();
  return {
    title: TITLE,
    description: DESC,
    applicationName: "Insight",
    keywords: [
      "retail inventory software", "point of sale", "POS system", "stock management",
      "multi-branch inventory", "online marketplace for sellers", "retail business software",
    ],
    alternates: origin ? { canonical: origin + "/" } : undefined,
    openGraph: {
      type: "website", siteName: "Insight", title: TITLE, description: DESC,
      url: origin ? origin + "/" : undefined,
      images: origin ? [{ url: `${origin}/brand/insight-logo.png`, width: 260, height: 249, alt: "Insight" }] : undefined,
    },
    twitter: { card: "summary", title: TITLE, description: DESC },
    robots: { index: true, follow: true },
  };
}

/* Inline icons: this is a server component, so no client icon library is
   pulled into the bundle for static sections. */
const I = ({ d, ...r }: { d: string } & React.SVGProps<SVGSVGElement>) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...r}>
    <path d={d} />
  </svg>
);
const Check = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const Dash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
);

const FEATURES = [
  { t: "Inventory Management", d: "Products, stock levels, adjustments and transfers, with every movement recorded and attributable.", i: "M20 7 12 3 4 7v10l8 4 8-4V7Z M4 7l8 4 8-4 M12 11v10" },
  { t: "Point of Sale", d: "A till that keeps selling when the internet drops. Sales queue on the device and sync once, never twice.", i: "M3 10h18 M5 6h14l2 14H3L5 6Z M9 14h6" },
  { t: "Sales Management", d: "Full sales history with receipts, and reversals that put stock back where it came from.", i: "M3 3v18h18 M7 14l4-4 3 3 5-6" },
  { t: "Reporting and Profit", d: "Profit reporting across a date range, plus stock valuation and movement history you can audit.", i: "M4 20V10 M10 20V4 M16 20v-6 M22 20H2" },
  { t: "Expense Tracking", d: "Record what the business spends by category, so profit reflects more than the till.", i: "M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { t: "Customer Management", d: "Customer records, credit balances and statements, so you know who owes what.", i: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87" },
  { t: "Suppliers and Purchasing", d: "Supplier records and purchase orders, received against stock so costs stay accurate.", i: "M10 17h4V5H2v12h3 M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1 M7.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M17.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4" },
  { t: "Employees and Shifts", d: "Staff accounts with cashier shifts, opening and closing floats, and variance on cash-up.", i: "M18 21a6 6 0 0 0-12 0 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
  { t: "Multi-Branch", d: "Run more than one location on one account, with stock held and transferred per branch.", i: "M3 21h18 M5 21V7l7-4 7 4v14 M9 9h2 M13 9h2 M9 13h2 M13 13h2 M9 17h6" },
  { t: "Insight Store", d: "Sell on the central marketplace from the same inventory, so nothing is counted twice.", i: "M3 9h18l-1.5 11H4.5L3 9Z M8 9V6a4 4 0 1 1 8 0v3" },
  { t: "Offline Operations", d: "The app is installable and keeps working without a connection; queued work syncs when you return.", i: "M5 12.5a7 7 0 0 1 12-5 M19 11.5a7 7 0 0 1-12 5 M5 4v4h4 M19 20v-4h-4" },
  { t: "Security and Access Control", d: "Owner, manager and cashier roles enforced on the server, not just hidden in the interface.", i: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z M9 12l2 2 4-4" },
];

const STEPS = [
  { t: "Create an account", d: "Register the business and the owner account. Nothing else is required to begin." },
  { t: "Set up the business", d: "Name, currency, tax rate and your first branch, from Settings." },
  { t: "Choose an operating package", d: "Pick which parts of Insight your business uses. The package can be changed later and no records are ever deleted by changing it." },
  { t: "Add products and opening stock", d: "Create products and record what is on the shelf today, per branch." },
  { t: "Start trading", d: "Sell at the counter, receive purchases, and — once approved — list on Insight Store." },
];

const PACKAGES = [
  { n: "Full", d: "Everything Insight does, for a business that sells at a counter and on the marketplace.", on: ["Inventory and purchasing", "Point of Sale and sales", "Customers, expenses, profit", "Insight Store selling"], off: [] },
  { n: "Inventory Only", d: "Stock control on its own, with no till and no marketplace.", on: ["Inventory and purchasing", "Stock reports and movements"], off: ["Point of Sale and sales", "Insight Store selling"] },
  { n: "Store and Inventory", d: "Stock control plus marketplace selling, without a physical counter.", on: ["Inventory and purchasing", "Insight Store selling"], off: ["Point of Sale and sales"], feat: true },
  { n: "POS and Inventory", d: "Counter trading and stock control, without marketplace selling.", on: ["Inventory and purchasing", "Point of Sale and sales", "Customers, expenses, profit"], off: ["Insight Store selling"] },
];

export default async function LandingPage() {
  const token = cookies().get("insight_access_token")?.value;
  const signedIn = Boolean(token && (await verifyAccessToken(token).catch(() => null)));

  return (
    <div className="lp">
      <a href="#features" className="lp-sr">Skip to content</a>
      <Showcase signedIn={signedIn} />

      {/* ------------------------------------------------ Features */}
      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <p className="lp-kicker">What Insight does</p>
          <h2 className="lp-h2">One system behind the counter and the catalogue.</h2>
          <p className="lp-sub">
            Every capability below is built and running in the product today. Which of them
            your business sees depends on the package it is on.
          </p>
          <div className="lp-grid lp-g3">
            {FEATURES.map((f) => (
              <article className="lp-card" key={f.t}>
                <div className="lp-card-ico"><I d={f.i} /></div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ How it works */}
      <section className="lp-sec lp-sec-alt" id="how-it-works">
        <div className="lp-wrap">
          <p className="lp-kicker">How it works</p>
          <h2 className="lp-h2">From a new account to trading.</h2>
          <p className="lp-sub">
            Setting up is self-service. Selling on Insight Store is the one step that needs
            a decision from us, because every seller on the marketplace is reviewed.
          </p>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li className="lp-step" key={s.t}>
                <span className="lp-step-n" aria-hidden="true" />
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="lp-cta-row" style={{ marginTop: 28 }}>
            <a className="lp-btn lp-btn-primary lp-btn-lg" href="/register">Create an account</a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Pricing */}
      <section className="lp-sec" id="pricing">
        <div className="lp-wrap">
          <p className="lp-kicker">Packages</p>
          <h2 className="lp-h2">Choose how much of Insight you run.</h2>
          <p className="lp-sub">
            An <strong>operating package</strong> decides which parts of the product a
            business can use, and an owner changes it in Settings at any time. Switching
            package only hides modules — records are kept and come back if you switch back.
          </p>
          <div className="lp-grid lp-g2">
            {PACKAGES.map((p) => (
              <div className={`lp-pkg${p.feat ? " feat" : ""}`} key={p.n}>
                <h3>{p.n}</h3>
                <p className="lp-pkg-note">{p.d}</p>
                <ul>
                  {p.on.map((x) => <li key={x}><Check />{x}</li>)}
                  {p.off.map((x) => <li className="off" key={x}><Dash />{x}</li>)}
                </ul>
                <a className={`lp-btn ${p.feat ? "lp-btn-primary" : "lp-btn-ghost"}`} href="/register">
                  Get Started
                </a>
              </div>
            ))}
          </div>
          <p className="lp-note">
            <strong>On subscription plans:</strong> Insight does not bill through the product
            yet — there is no subscription or payment step in the application, and no prices
            are published here because none are configured. A business picks its operating
            package in Settings and uses it. Subscription plans, when they arrive, will sit
            alongside packages: the package decides what you can use, the plan would decide
            what you pay for it.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------ Insight Store */}
      <section className="lp-sec lp-sec-alt" id="insight-store">
        <div className="lp-wrap">
          <p className="lp-kicker">Insight Store</p>
          <h2 className="lp-h2">One marketplace, every approved seller.</h2>
          <p className="lp-sub">
            Insight Store is a single central marketplace — not a website builder. Sellers do
            not get their own shop domain; they get a seller profile and listings inside one
            storefront that shoppers browse without an account.
          </p>
          <div className="lp-grid lp-g2">
            <article className="lp-card">
              <h3>Approval before selling</h3>
              <p>
                A business applies from Settings. The Insight Store team reviews the business
                and its documents, and may come back for more information before deciding.
                Approval creates the seller profile — it does not publish any products.
              </p>
            </article>
            <article className="lp-card">
              <h3>Listings are moderated separately</h3>
              <p>
                Approved sellers choose which inventory products to publish. Each listing is
                reviewed before it goes live, and editing what shoppers see on a live listing
                sends it back for review.
              </p>
            </article>
            <article className="lp-card">
              <h3>Stock comes from inventory</h3>
              <p>
                Marketplace availability reads the seller&apos;s own stock at their fulfilment
                branch, and is only deducted when the seller confirms an order — so the same
                unit is never sold twice.
              </p>
            </article>
            <article className="lp-card">
              <h3>Ordering over WhatsApp</h3>
              <p>
                A shopper fills one cart across sellers; checkout splits it into one order
                request per seller and opens a prefilled WhatsApp message to each. Payment and
                delivery are agreed directly with the seller — Insight takes no payment.
              </p>
            </article>
          </div>
          <div className="lp-cta-row" style={{ marginTop: 30 }}>
            <a className="lp-btn lp-btn-light lp-btn-lg" href="/store">Browse Insight Store</a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ About */}
      <section className="lp-sec" id="about">
        <div className="lp-wrap">
          <p className="lp-kicker">About us</p>
          <h2 className="lp-h2">Built for shops that outgrew the notebook.</h2>
          <div className="lp-grid lp-g2">
            <div>
              <p className="lp-sub" style={{ marginTop: 0 }}>
                Insight is retail software for businesses whose stock lives in more
                than one place and whose sales happen in more than one way. The problem it
                addresses is a familiar one: the counter knows one number, the stockroom knows
                another, and the online listing knows a third.
              </p>
              <p className="lp-sub">
                So Insight keeps one record. A sale at the till, a transfer between branches,
                a purchase received and an order from the marketplace all move the same stock.
                It works offline because connectivity is not a given, and it is built in
                modules because not every business needs every part on day one.
              </p>
            </div>
            <div>
              <p className="lp-sub" style={{ marginTop: 0 }}>
                The aim is that a business owner can answer the questions that actually matter
                — what do I have, what sells, what did it cost me, who owes me — without
                reconciling three places first.
              </p>
              <p className="lp-sub">
                Insight Store extends that to reach: once a business already keeps accurate
                stock in Insight, letting shoppers find those products should not mean
                maintaining a second catalogue somewhere else.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Final CTA */}
      <section className="lp-sec lp-sec-alt">
        <div className="lp-wrap lp-final">
          <h2 className="lp-h2">Your Business Deserves Better Insight.</h2>
          <p className="lp-sub">
            Bring your business operations together, make informed decisions and build a
            clearer path to growth.
          </p>
          <div className="lp-cta-row">
            <a className="lp-btn lp-btn-primary lp-btn-lg" href="/register">Get Started</a>
            <a className="lp-btn lp-btn-ghost lp-btn-lg" href="/login">Sign In</a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Footer */}
      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-top">
            <div className="lp-foot-brand">
              <img src="/brand/insight-logo-light.png" alt="Insight" width={260} height={249} />
              <p>Inventory, point of sale and marketplace selling on one set of numbers.</p>
            </div>
            <div className="lp-foot-cols">
              <div className="lp-foot-col">
                <h4>Product</h4>
                <ul>
                  {NAV_LINKS.filter((l) => l.href !== "/").map((l) => (
                    <li key={l.label}><a href={l.href}>{l.label}</a></li>
                  ))}
                </ul>
              </div>
              <div className="lp-foot-col">
                <h4>Account</h4>
                <ul>
                  <li><a href="/login">Sign In</a></li>
                  <li><a href="/register">Get Started</a></li>
                  <li><a href="/store">Shop the marketplace</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="lp-foot-bar">
            <span><strong>Insight by 9DEVs</strong></span>
            <span>
              Built by{" "}
              <a href="https://9devs-seven.vercel.app" target="_blank" rel="noopener noreferrer">9DEVs</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
