# Insight by 9DEVs — Architecture

## Stack at a glance

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, plain inline styles (no Tailwind/CSS framework) |
| Icons / Charts | lucide-react, recharts |
| Backend | Next.js Route Handlers (`app/api/*`) — no separate server |
| Database | PostgreSQL, hosted on Neon (serverless Postgres) |
| ORM | Prisma |
| Auth | Custom JWT (access token) + rotating opaque refresh token, bcrypt password hashing |
| Offline sync | IndexedDB queue + a client-side sync engine + a minimal service worker |
| Hosting | Vercel |

There is no separate backend service — API routes run as serverless functions inside the same Next.js deployment as the UI.

## Request flow

```
Browser (React components)
   │
   │  fetch("/api/...")
   ▼
Next.js middleware  ──► verifies JWT cookie, attaches x-insight-* headers,
                        redirects to /login if unauthenticated
   │
   ▼
Route Handler (app/api/.../route.ts)
   │  1. getSession()        — reads verified JWT claims
   │  2. requirePermission() — checks role against the action
   │  3. tenantScope()       — builds { businessId } filter
   ▼
Prisma Client ──► Neon Postgres
   │
   ▼
JSON response ──► React component updates state ──► re-renders
```

## Frontend

- **Routing**: one folder per screen under `app/` (`app/dashboard`, `app/pos`, `app/inventory`, etc.), each a thin `page.tsx` that renders a client component from `components/`.
- **Components**: each screen (`components/dashboard.jsx`, `components/pos.jsx`, …) is a single self-contained client component — its own local state, its own `fetch` calls, its own layout. There is no shared component library or global state manager (no Redux/Zustand/Context); state that needs to persist across screens (auth session) is re-fetched per screen via `/api/auth/me` rather than lifted to a shared store.
- **Styling**: everything is inline `style={{ }}` objects computed from a small palette (`primary`, `deep`, `bad`, `warn`, plus a `theme` object that flips for dark mode). No CSS framework, no CSS modules.
- **Data pattern**: every screen follows the same shape —
  1. `useState` for a "live" version of each dataset, initialized to `null`
  2. a `useEffect` that fetches from the relevant API route(s) on mount
  3. render logic that uses the live data once loaded, and shows a genuine empty state (not fake data) if it loads as empty

## Backend (API routes)

All routes live under `app/api/` and follow the same internal pattern:

```ts
const session = await getSession();                          // lib/tenant.ts
if (!requirePermission(session, "products:write")) { ... }   // lib/rbac.ts
const data = await prisma.product.findMany({
  where: tenantScope(session),                                // { businessId }
  ...
});
```

Key route groups:
- `auth/` — register, login, logout, refresh, me
- `products/`, `inventory/movements/` — catalog and stock
- `sales/` — the core POS transaction (idempotent on `clientTxnId`, computes cost/profit from real product cost, decrements stock, opens credit accounts)
- `customers/`, `customers/[id]/payments`, `customers/[id]/statement` — credit
- `purchases/`, `purchases/[id]/receive` — restocking, partial receiving
- `suppliers/` — includes computed cross-supplier price comparison
- `expenses/`, `employees/`, `employees/shifts/` — operations
- `branches/` — per-branch summaries
- `reports/profit` — the single source of truth for gross/net profit, used by Dashboard, Reports, and Expenses so the three screens can never disagree

## Data layer

- **Schema**: `prisma/schema.prisma` — 22 tables, 8 enums.
- **Multi-tenancy**: every business-owned table carries a `businessId` column with `onDelete: Cascade` from `Business`. `tenantScope()` (`lib/tenant.ts`) is the *only* sanctioned way to build a `businessId` filter, so a route can't accidentally leak data across tenants.
- **Multi-branch inventory**: stock lives in `InventoryLevel`, keyed by `(productId, branchId)` — not on the product itself — so branch quantities never collide.
- **Cost-based profit**: `SaleItem` stores `unitCost` and `lineProfit` at the moment of sale, so profit reflects actual inventory cost, not just the selling price.
- **Idempotent sales**: `Sale.clientTxnId` is unique per business and generated client-side, so a retried offline sync can never double-charge inventory.

## Auth & authorization

- **Login** issues a short-lived (15 min) signed JWT access token in an httpOnly cookie, plus a long-lived (30 day) opaque refresh token — only the refresh token's **hash** is stored server-side, so a leaked database row can't be replayed.
- **Refresh** rotates the refresh token on every use.
- **RBAC** (`lib/rbac.ts`): three roles (Owner, Manager, Cashier), each mapped to a fixed list of permission strings (e.g. `sales:create`, `employees:write`). Routes check permissions, not roles directly, so adding a new capability later is a one-line change.
- **Registration** always creates a brand-new Business + Owner. The only way for someone else to join an existing business is the Owner/Manager inviting them via `POST /api/employees` — registration itself can never add a user to someone else's business.

## Offline-first (POS)

- `lib/offline/db.ts` — a small IndexedDB wrapper, one store (`queued_sales`).
- `lib/offline/sync-engine.ts` — a singleton that watches `online`/`offline` events, walks the queue, and distinguishes a **transient** failure (network drop, 5xx — retries silently) from a **genuine conflict** (insufficient stock at sync time — surfaces to the user, never silently dropped).
- `public/sw.js` — caches the app shell only, never API responses, so there's one source of truth (the IndexedDB queue) for what's pending.

## Infrastructure

- **Database**: a Neon Postgres project, schema applied via a tested migration (verified on a temporary branch before touching production).
- **Hosting**: deployed to Vercel; `postinstall: prisma generate` runs automatically on every build.
- **Environment variables**: `DATABASE_URL` (Neon connection string), `JWT_SIGNING_SECRET` (signs/verifies access tokens) — both set in Vercel's project settings, never committed to the repo.

## Packages (Full / Inventory Only / Store and Inventory / POS and Inventory)

Each business has one package, `Business.appMode`: `FULL` (default), `INVENTORY_ONLY`,
`STORE_INVENTORY`, `POS_INVENTORY`. `Business.pendingAppMode` holds a requested package that is
waiting on Insight Store seller approval.

| Module | Full | Inventory Only | Store and Inventory | POS and Inventory |
|---|---|---|---|---|
| Inventory, products, purchases, suppliers, reports (inventory) | ✓ | ✓ | ✓ | ✓ |
| POS, sales, customers, expenses, profit, shifts, analytics | ✓ | — | — | ✓ |
| Insight Store selling (`store`) | ✓ | — | ✓ | — |

- **Server enforcement — `lib/features.ts`.** `moduleGate(session, module)` returns
  `403 { code: "MODULE_DISABLED" }` for a module outside the package. Store seller APIs use
  `requireSeller` (`lib/store/server.ts`), which also requires an approved, active seller record.
- **Changing package — `PUT /api/business/mode`.** Owner only (`settings.manage_application_mode`),
  explicit `confirm: true`, transactional, audit-logged. Choosing Store and Inventory without seller
  approval does not change the package: it sets `pendingAppMode`, opens a seller application, and the
  package is applied automatically when the application is approved. Withdrawal or rejection clears it.
  Super Admins can override the package (`PATCH /api/admin/businesses/[id]`, `set_mode`, with reason).
- **Interface — `lib/nav.js`.** `hasPos(mode)` / `hasStore(mode)` drive navigation: packages without
  POS hide POS screens and redirect them to `/inventory`; packages with Store add an "Insight Store"
  sidebar item (`/seller`). Settings → Business Configuration → Package shows all four.
- **Data is never deleted.** Hidden modules keep their records; switching back restores them. Published
  listings are hidden from the marketplace while the package excludes Store.

## Insight Store (central multi-vendor marketplace)

Public marketplace at `/store` (intended domain `store.insight.9devs.app`, not yet configured).
Guests browse, search, build one cart across sellers and send each seller an order request on
WhatsApp. No online payment, no seller websites or custom domains.

**Seller approval.** `StoreSellerApplication` (Draft → Submitted → Under review → Additional info
required → Approved / Rejected / Withdrawn; state machine in `lib/store/core.ts`). Entry points:
Settings → Business Configuration → Insight Store, or choosing a package that includes Store. Never
part of registration or onboarding. A partial unique index allows one open application per business.
Documents (PDF/PNG/JPEG ≤ 5 MB, checked by magic bytes) are stored in Postgres (`StoreDocument`,
bytea, SHA-256), served only to the owner and to admins with `marketplace.read`; every admin view is
audit-logged. Every transition writes `StoreApplicationEvent` (admin internal notes are flagged
`internal` and never shown to the business). Approval creates `StoreSeller` and applies any pending
package. It never publishes products.

**Listings over inventory.** `StoreListing` is a publication layer over an existing `Product` (one per
product). It holds title, description, optional store price, category, photos and status; it never
holds stock. Availability is the product's `InventoryLevel` at the seller's fulfilment branch
(`StoreSeller.fulfilmentBranchId`, default main branch), so marketplace and in-store sales draw on one
count. Statuses: Draft → Submitted → Under review → Published / Rejected; Unpublished. Approval
publishes. Editing customer-visible content of an approved listing returns it to Draft for re-review.
An unedited unpublished listing can be republished without review. Public visibility
(`PUBLIC_LISTING_WHERE`, `lib/store/listing.ts`) requires: listing published and visible, product
active, business active, package includes Store, seller active.

**Cart and checkout.** Guest cart token in an httpOnly cookie; only its SHA-256 is stored
(`StoreCart`). Checkout (`POST /api/store/public/checkout`) revalidates every line against live
availability, splits the cart into one `StoreOrder` per seller, and is idempotent on a client
`idempotencyKey` (`StoreCheckout`, unique). The status-page token is derived (HMAC) from that key, so
a retried submit returns the same orders and links. Orders hold **no** stock while `NEW` and expire
after `StoreConfig.orderExpiryHours` (lazy expiry when orders are read).

**WhatsApp.** Insight builds `wa.me` links with a prefilled order message (seller's number,
normalised with Ghana +233 as default). It records when the link was generated and when the customer
tapped it (`whatsappOpenedAt`); it never claims a message was sent, accepted or paid.

**Seller order management** (`lib/store/orders.ts`). Valid transitions only (`ORDER_TRANSITIONS`).
Confirming takes stock with a conditional decrement (`quantity >= n`) plus a `STOCK_OUT` movement, so
two confirmations can never oversell; any shortfall rolls back the whole confirmation. Cancelling a
confirmed order returns stock with a `RETURNED` movement (`stockDeducted` guards against doing either
twice). Payment is recorded by the seller (`record_payment`); completion requires it. Reject/cancel
require a reason, which the customer sees on their status page.

**Sharing and attribution.** Share buttons use public share URLs (WhatsApp, Facebook, X, Telegram)
or the device share sheet / copy link (Instagram, TikTok have no web share URL). Shared links carry
`?ref=<channel>`; Insight counts taps, visits and later orders (`StoreAttributionEvent`). No social
network API is used.

**Administration.** `/admin/store` (permissions `marketplace.read`, `marketplace.manage`): overview,
application review (start review, request info, approve, reject, internal notes, documents), sellers
(suspend/reinstate with reason, feature), listing moderation (approve/reject/take down/feature),
read-only order oversight (customer names masked in lists; detail views audit-logged), marketplace
settings (open/closed, announcement, expiry hours, required documents) and categories. Every change
writes `PlatformAuditLog`.

## Notifications

- **Business** (`Notification`): one row per recipient user (`userId`), so unread counts and read state
  are per person; `dedupeKey` (unique per user) makes creation idempotent. Created by `lib/notify.ts`:
  low/out-of-stock alerts after sales, adjustments, transfers, receiving and store confirmations
  (deduped per product, re-armed when stock recovers); new store orders; application and listing
  decisions; seller suspension. `GET /api/notifications` (cursor pagination, own rows only) and
  `POST /api/notifications/read` (`ids` or `all`).
- **Platform** (`PlatformNotification` + per-admin `PlatformNotificationRead`): new/updated seller
  applications and listings awaiting review. `GET/POST /api/admin/notifications[/read]`.
- **UI**: `components/notification-bell.jsx` in every business screen header and the admin console:
  real unread count (polled every 60 s while visible), panel with mark read / mark all read,
  click-through to the related screen, load older, loading/empty/error states.

## Offline POS (current behaviour)

- The POS caches the catalog, customers and session in `localStorage` after each successful load,
  and falls back to it when offline.
- A sale is posted directly when online. If the device is offline, the request fails to reach the
  server, or the server returns 5xx, the sale is written to the IndexedDB queue
  (`lib/offline/db.ts`) with the same `clientTxnId` and its `occurredAt` time.
- `lib/offline/sync-engine.ts` sends queued sales oldest-first on reconnect, every 60 s while
  pending, and on page load. `POST /api/sales` is idempotent on `(businessId, clientTxnId)`, so
  resends never duplicate a sale. Sales stuck in `syncing` after a crash are reset to `pending`.
  `401` is treated as transient; other `4xx` (e.g. insufficient stock) mark the sale `failed` with
  the reason, visible in the POS status pill with a Retry action.
- Supported offline: cash, mobile money, card, bank transfer and other sales. Not offline: credit
  sales (need a live credit-limit check), voids/refunds, stock changes, purchasing.
- `public/sw.js`: cache-first for `/_next/static`, network-first for pages with a cached fallback,
  never intercepts `/api/*`. Registered in production by `components/sw-register.tsx`.

## Platform admin console (milestone 1)

- **Separate identity.** `PlatformAdmin` is its own table; business users and Owners can never
  satisfy an admin check. Roles: Super Admin, Platform Admin, Technical Admin, Support Admin,
  Analyst. Every API checks a granular permission (`lib/admin/permissions.ts`), not a role name.
  `administrators.manage` is reserved for Super Admins regardless of stored grants.
- **Sign-in.** Password, then a TOTP code (RFC 6238, `lib/admin/totp.ts`). MFA is mandatory for all
  admins and enrolled on first sign-in. TOTP secrets are AES-256-GCM encrypted with
  `PLATFORM_ADMIN_SECRET`. Temporary passwords must be changed before any other admin API works.
- **Sessions.** Opaque random token in the `insight_admin_session` cookie (httpOnly, SameSite=Strict);
  only its SHA-256 hash is stored in `PlatformAdminSession`. 8 h absolute and 60 min idle limits.
  Checked against the database on every request, so revocation is immediate.
- **Rate limiting.** 5 failed passwords per email, or 5 failed codes per admin, in 15 minutes → 429.
- **Authorization.** `requireAdmin(permission)` in `lib/admin/session.ts` runs at the top of every
  `/api/admin/*` handler. Middleware only redirects visitors without an admin cookie to `/admin/login`.
- **Audit.** `PlatformAuditLog` is append-only, enforced by a Postgres trigger that rejects
  UPDATE/DELETE/TRUNCATE. It records actor, role, action, target, reason, before/after, IP and
  Vercel request ID. Admin changes to a business are also written to that business's own `AuditLog`.
- **Suspension.** `Business.status = SUSPENDED` blocks login and token refresh and revokes refresh
  tokens. Open access tokens lapse within 15 minutes. No records are deleted.
