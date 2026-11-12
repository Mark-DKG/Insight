import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/store/origin";

export const dynamic = "force-dynamic";

// The marketing site and the public marketplace are indexable. Everything
// behind a session — the business app, the seller area and the platform admin
// console — is not, and neither are the per-order customer status pages.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/store"],
        disallow: [
          "/api/", "/admin", "/dashboard", "/seller", "/settings", "/pos", "/sales",
          "/inventory", "/products", "/purchases", "/customers", "/suppliers",
          "/expenses", "/reports", "/employees", "/advanced",
          "/store/cart", "/store/orders/", "/store/account",
        ],
      },
    ],
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
  };
}
