import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/store/public";

// GET /api/store/public/catalog?q=&category=&seller=&sort=&inStock=1&min=&max=&page=
export async function GET(request: Request) {
  const u = new URL(request.url).searchParams;
  const num = (k: string) => { const v = Number(u.get(k)); return u.get(k) && Number.isFinite(v) ? v : undefined; };
  const result = await searchCatalog({
    q: u.get("q") ?? undefined, category: u.get("category") ?? undefined, seller: u.get("seller") ?? undefined,
    sort: u.get("sort") ?? undefined, inStock: u.get("inStock") === "1", minPrice: num("min"), maxPrice: num("max"), page: num("page"),
  });
  return NextResponse.json(result);
}
