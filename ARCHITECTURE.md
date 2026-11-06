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
