import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "./lib/jwt";

const AUTH_COOKIE = "insight_access_token"; // keep in sync with lib/auth.ts

// Routes that don't require a session. Everything else under /api and the
// authenticated app shell is protected by default — a new route is secure
// unless explicitly listed here, rather than the other way around.
const PUBLIC_PATHS = [
  // Public marketing site. Exact match only: the list is compared with
  // `pathname === p` or `pathname.startsWith(p + "/")`, so "/" never widens
  // into a prefix that would expose the authenticated app.
  "/",
  "/robots.txt",
  "/sitemap.xml",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  // Crash reports must get through even when the session has expired.
  "/api/client-errors",
  // Insight Store marketplace: guests browse, build a cart and place order
  // requests without an account. Only the public, read-safe store API is
  // open; seller and admin store APIs stay protected.
  "/store",
  "/api/store/public",
];

// Platform admin area: completely separate auth (lib/admin/session.ts).
// Middleware only checks that an admin session cookie is present so
// unauthenticated visitors are sent to /admin/login; every admin API route
// validates the session against the database and checks permissions itself.
const ADMIN_PUBLIC = ["/admin/login", "/api/admin/auth/login", "/api/admin/auth/mfa"];
const ADMIN_COOKIE = "insight_admin_session";

function handleAdmin(request: NextRequest, pathname: string) {
  if (ADMIN_PUBLIC.some((p) => pathname === p)) return NextResponse.next();
  if (request.cookies.get(ADMIN_COOKIE)?.value) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dedicated marketplace host (e.g. store.insight.9devs.app): its root and
  // non-store paths show the marketplace. Only takes effect once the domain
  // is attached to the project.
  const host = request.headers.get("host") ?? "";
  if (host.startsWith("store.") && !pathname.startsWith("/store") && !pathname.startsWith("/api/store/public") && !pathname.startsWith("/_next")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/store" : `/store${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/")) {
    return handleAdmin(request, pathname);
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;

  if (!claims) {
    // Expired access token but a refresh token is present: rotate it
    // server-side and come straight back, instead of forcing a re-login.
    if (!pathname.startsWith("/api/") && request.cookies.get("insight_refresh_token")?.value) {
      const refreshUrl = new URL("/api/auth/refresh", request.url);
      refreshUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(refreshUrl);
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Not authenticated. Please log in again." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Forward the verified claims to downstream handlers via request headers
  // so route handlers don't need to re-verify the JWT on every call.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-insight-user-id", claims.sub);
  requestHeaders.set("x-insight-business-id", claims.businessId);
  requestHeaders.set("x-insight-role", claims.role);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all routes except Next.js internals and files served from
     * public/. Anything under public/ is a static asset with no session to
     * check, and running the auth gate over it redirects it to /login — which
     * silently breaks the logo, the product images and service worker
     * registration for signed-out visitors. New public/ folders must be added
     * here too.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|brand/|products/|geo/).*)",
  ],
};
