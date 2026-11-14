# Insight — Comprehensive Platform, Service Quality and Technical Audit

| | |
|---|---|
| **Audited** | `Mark-DKG/Insight`, branch `main`, commit `261f20a` (Insight Store reviews merge), plus the live production deployment `dpl_2S3dUJE7ThZJyCSwrc2Fz6wrTpCH` |
| **Audit date** | 14 November 2026 |
| **Type** | Read-only audit. No source file, schema, environment variable or deployment setting was changed. Nothing was committed. This report is the only file added (untracked). |
| **Status labels** | PASS · PARTIAL · FAIL · MISSING · UNVERIFIED · NOT APPLICABLE |
| **Severity labels** | Critical · High · Medium · Low · Enhancement |

## How to read this report

- **Evidence standard.** Every finding cites a file, route, model or test. "Code-evident" means the defect follows from reading the code and the database schema; it was **not** reproduced under load or against production. That is stated wherever it applies. Nothing in this report is an invented benchmark.
- **What was executed** (Section 9): the 7 existing unit-test files (122 tests, all passing), two read-only GETs against production, read-only Vercel and Neon metadata calls. Nothing else could be run, for reasons listed in Section 14.
- **Scores** are internal audit assessments, not certified ratings. The Performance dimension (10 %) was **not measured** and is excluded; the remaining weights are renormalised over 90 %.
- **Depth varies.** Money, stock, authentication, offline, email and the Store checkout were read closely. Seller listing moderation, most Super Admin screens, branch administration, and the visual/mobile/accessibility layer were examined lightly or not at all. Section 14 lists exactly what is unverified.

---

## 1. Executive summary

**Overall state.** Insight is a real, working multi-tenant application with a sound foundation: secure-by-default routing, consistent tenant scoping, role permissions plus package gating enforced on the server, audit logging on money actions, a careful offline queue, and a well-built Insight Store and email subsystem that are the best-tested parts of the platform. It is **not yet dependable enough to run a business's daily cash, stock and credit on**. The retail core (POS, stock, credit, supplier balances, analytics) has correctness and completeness gaps that would show up quickly under real trading, and that core has **no automated tests at all**.

**Strengths (verified)**
- Every API route sampled applies tenant scoping; the middleware denies by default (`middleware.ts`), and package limits are enforced in the backend, not only hidden in the UI (`lib/features.ts` `moduleGate`).
- Refresh tokens are stored hashed; password reset is single-use and revokes sessions; admin console has separate auth, mandatory TOTP enrolment, lockout and audit.
- Insight Store uses the correct atomic stock pattern (conditional decrement on order confirm), idempotent checkout, DB check constraints, and 85/85 end-to-end checks passed for reviews earlier today.
- Email: signed webhooks, rate-limited public flows, hashed tokens, outbox with retries; 30 unit tests pass.
- Offline POS: every sale goes through an idempotent queue keyed by `clientTxnId` with status UI and recovery after a closed tab.

**Most serious weaknesses**
1. **Stock can go negative / be overwritten** under concurrent activity: POS sale, stock transfer and stock adjustment all read-then-write without an atomic condition, and the database has no `quantity >= 0` constraint (F-016, F-017, F-018).
2. **Credit limits are never enforced by the server**, while the POS tells the cashier they are checked (F-019). Credit-sale refunds also record money going back out that was never received (F-023).
3. **A POS sale can attach credit to another business's customer record** if its ID is known (F-001).
4. **Analytics are computed in the browser from the last 100 sales and first 100 products**, so trends and inventory value are wrong for any real shop; fake sample numbers appear when a request fails or while loading; export buttons do nothing (F-034, F-035, F-036).
5. **Cashiers cannot open or close their own shifts** (permission mismatch) and there is **no way to suspend, edit or change the role of an employee** (F-029, F-030).
6. **Supplier balances can only go up**; there is no supplier payment, PO approval or cancel (F-031).
7. **No CI, no lint, no lockfile, no error monitoring, no tested backup recovery** (6-hour point-in-time window only) (F-009, F-042, F-045, F-046).
8. **No privacy notice, terms or consent capture** despite collecting personal data of staff, customers and shoppers (F-044).

**Critical risks.** No finding was verified as an immediately exploitable Critical in production. The highest are four **High** defects that corrupt stock or money records without any attacker (F-016, F-017, F-019, F-023) and one cross-tenant write (F-001).

**Maturity.** Insight Store and email: late beta, close to launch-ready once a sending domain exists. Retail core: prototype-to-beta; the screens exist and mostly work, the integrity guarantees and reporting do not yet.

**Readiness for real business use.** Suitable now for a **supervised pilot with one or two friendly businesses** using Inventory plus the Store, and POS only with the safeguards in Phase A. **Not ready** for unsupervised commercial rollout or paid subscriptions.

**Immediate actions** (all small): make the three stock writes atomic and add a `CHECK (quantity >= 0)`; enforce credit limits and validate `customerId`/`branchId` ownership in `POST /api/sales`; stop rendering sample figures; give cashiers the shift permission; add employee suspend/role-change; add a lockfile and a CI job that runs the existing tests; write and test one backup restore.

---

## 2. Architecture overview (discovered from the repository)

| Area | Finding | Evidence |
|---|---|---|
| Frontend | Next.js 14.2 App Router, React 18, plain JS/JSX client components with inline styles, recharts, lucide-react | `package.json`; `components/*.jsx` (20 files, ~10.3k lines) |
| Backend | Next.js route handlers (108 `route.ts` files) on Vercel serverless, region iad1; no separate service | `app/api/**` |
| Language | TypeScript for server/lib; **JavaScript (`.jsx`) for all main screens, not type-checked** (`allowJs` without `checkJs`) | `tsconfig.json` |
| Database | PostgreSQL 18 on Neon (free plan, aws-us-east-1, single branch of production data), Prisma 5.19 | Neon `describe_project`; `prisma/schema.prisma` (54 models, 17 enums, 11 migrations) |
| Auth | Custom: 15-minute HS256 JWT access cookie + 30-day rotating opaque refresh token (hashed); bcrypt cost 12 | `lib/jwt.ts`, `lib/auth.ts`, `app/api/auth/*` |
| Separate identities | Business users, Store shoppers, platform admins each have their own session model | `StoreShopperSession`, `PlatformAdminSession` |
| API style | JSON route handlers; zod validation on bodies; no shared client; per-screen `fetch` | `app/api/**`, `components/auth-fetch.tsx` |
| State management | None global; each screen refetches `/api/auth/me` and its data | `ARCHITECTURE.md`, components |
| Styling | Inline style objects (retail app); `app/store/store.css` and `app/landing.css` for public areas | — |
| Integrations | Resend (email), WhatsApp via `wa.me` links only (no API), Vercel Cron | `lib/email/*`, `vercel.json` |
| Background jobs | One Vercel Cron: `/api/cron/email`, **daily at 05:00 UTC** | `vercel.json` |
| Offline | IndexedDB queue + sync engine + app-shell service worker; POS catalogue cached in `localStorage` | `lib/offline/*`, `public/sw.js`, `components/pos.jsx` |
| Testing | 7 unit files (122 tests), 7 E2E scripts (need a running deployment), UI smoke harness (needs Playwright + esbuild installs) | `tests/**` |
| CI/CD | **None in the repo.** Deploys happen via Vercel's Git integration on push to `main`; `build` runs `prisma generate && next build` | no `.github/`; `package.json` |
| Lint | **No ESLint config or script** | repo root |
| Migrations | Applied **manually** to production (not part of the Vercel build) | `DEPLOY.md`, deployment history |
| Lockfile | **None committed**; all dependencies use `^` ranges | repo root |
| Env management | Vercel project env; `.env.example` documents placeholders only | `.env.example`; production variable *names* checked, values never decrypted |
| Docs | `ARCHITECTURE.md` is out of date (says 22 tables, 3 roles, two env vars, and that screens never show sample data) | `ARCHITECTURE.md` |

**Production configuration (names only).** Present in Production: `DATABASE_URL`, `JWT_SIGNING_SECRET`, `PLATFORM_ADMIN_SECRET`, `CRON_SECRET`, `EMAIL_ENABLED=true`, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET`. **Not set in Production:** `EMAIL_FROM_ADDRESS` (so the app uses Resend's test sender, which delivers only to the Resend account owner), `EMAIL_REPLY_TO`, `EMAIL_CONTACT_ADDRESS`, `EMAIL_ADMIN_ADDRESS` (defaults apply), `NEXT_PUBLIC_*` origins, `APP_PUBLIC_URL`. This corrects the "RESEND_API_KEY not yet configured" context in the brief: the key **is** now configured, but real customer delivery is still blocked by the missing verified domain.

---

## 3. Complete service audit

Conventions: **Verified** = read in code and consistent with schema and (where noted) tests. **Not load-tested.**

### 3.1 Inventory management

- **Existing:** product CRUD with soft-delete (`app/api/products/**`), categories, SKU and barcode uniqueness per business (`@@unique([businessId, sku])`, `[businessId, barcode]`), per-branch `InventoryLevel`, typed movements (`InventoryMovementType`), adjustments with reasons, branch transfers, low-stock alerts (`lib/notify.ts`), movement history (`GET /api/inventory/movements`), audit rows for adjustments and transfers.
- **PASS (verified):** tenant checks on product/branch ownership in adjust and transfer; zero-change and negative-result guards; movement + audit written in the same transaction; pagination on products (max 100/page).
- **FAIL (code-evident):** F-016/F-017/F-018 atomicity; no DB-level non-negative constraint.
- **PARTIAL:** movement types exist for expiry/damage, but there is **no batch or expiry-date tracking**, no stock-count workflow (the Reports screen says so), no valuation report beyond a client-side sum over the first 100 products (F-034).
- **MISSING:** product import/export, bulk edit, duplicate-product detection, stock-in-transit for transfers (transfers are instantaneous), minimum/maximum reorder suggestions.
- **Cost method:** receiving a purchase overwrites `costPrice` with the latest unit cost ("last cost"), not a weighted average (F-032).
- **Security:** `inventory:adjust` is Owner/Manager only (`lib/rbac.ts`). PASS.
- **Verdict:** usable for a single-user shop with low concurrency; not safe where POS, Store confirmations and staff adjust stock at the same time.

### 3.2 Point of Sale

- **Existing:** cart, discount %, payment methods, credit sales, receipt print/share (`lib/receipt.js`), offline queue, sync status, void/refund (`/api/sales/[id]/reverse`), idempotent submit.
- **PASS:** permission + `pos` module gate; products re-read server-side (client prices are never trusted); cost and profit snapshotted per line; sale, items, payment, stock, movements, credit account and audit are one transaction.
- **FAIL (code-evident):** F-001, F-016, F-019, F-020, F-021, F-023, F-025.
- **PARTIAL:** receipts exist but **tax is hard-wired to 0** (`taxAmount: 0`), so VAT/levy handling is MISSING; only one payment method per sale (no split payment, no change calculation checked); no hold/park cart (not found); no per-cashier discount limit.
- **Shifts:** FAIL for cashiers (F-029).
- **UNVERIFIED:** checkout speed, barcode scanner behaviour, receipt printing on real thermal hardware.

### 3.3 Sales management

- **Existing:** sales list (`GET /api/sales`), sale detail with receipt, void/refund with reason, status model COMPLETED / VOIDED / REFUNDED.
- **PASS:** reversal restores stock to the original branch, reverses only the unpaid credit, writes audit.
- **FAIL:** reversal race (F-022); refund of a credit sale records an outgoing payment that never came in (F-023).
- **PARTIAL:** list is capped at 100 rows with no date filter or pagination (F-034); **whole-sale reversals only** (no partial refund, no exchange); cashiers can read every branch's sales (F-055).
- **MISSING:** sales export, employee/branch performance endpoints (the UI computes some client-side), receipt re-issue audit.

### 3.4 Business analytics

- **Existing:** `GET /api/reports/profit` (revenue, COGS, gross, expenses, net, count) filtered by date and branch; dashboard and report screens; an "advanced" screen with a rule-based Q&A over fetched data.
- **FAIL:** F-034 (client-side aggregation over truncated data), F-035 (sample numbers), F-036 (inert exports), F-033 (time zones and date edges).
- **PARTIAL:** `/api/reports/profit` itself is a clean single source of truth for profit and is consistent across Dashboard/Reports/Expenses; `/api/branches/[id]` computes its own aggregate with separate code.
- **MISSING (the UI says so):** category profit, product profitability, stock discrepancies. Forecast and health-score blocks in `components/advanced.jsx` are **static constants** (`FORECAST`, `HEALTH_FACTORS`, `BRANCH_PERFORMANCE`) used when live data is absent.
- **Security:** reports require `reports:read` and the `finance` module. PASS.

### 3.5 Financial management

- **Existing:** expenses (create/list), profit report, customer credit ledger, supplier outstanding balance field.
- **Revenue vs cash:** profit uses **accrual revenue** (completed sale totals, including unpaid credit sales). There is **no cash-received report, receivables ageing, payables ageing, cash-flow statement or reconciliation view**. The `Payment` table stores a full-amount row for CREDIT sales (F-023), so it cannot be used as "cash received" without correction.
- **FAIL/PARTIAL:** supplier payments absent (F-031); expense edit/delete absent; customer payments are stored in `CreditPayment` but not surfaced in any financial summary.
- **No accounting compliance is claimed or established.**

### 3.6 Customer management (CRM)

- **Existing:** create/list customers, credit limit field, statement, payments against oldest open credit first.
- **FAIL:** credit limit unenforced (F-019); payment check outside the transaction (F-024).
- **MISSING:** edit/delete, merge/duplicate detection (no unique constraint on phone/email), segmentation, export, purchase-history screen beyond the statement.
- **Privacy:** customer names, phones and balances are cached in the browser `localStorage` and survive logout (F-041).

### 3.7 Supplier and purchasing

- **Existing:** supplier create/list/edit, purchase order creation, partial receiving that updates stock, movement, cost and supplier balance in one transaction; cheaper-supplier comparison by SKU.
- **FAIL/PARTIAL:** F-031 (no supplier payments, approval, cancel or PO edit; receive limit check outside the transaction), F-032 (last-cost method).
- **PASS:** ownership checks on PO lines; status moves to PARTIALLY_RECEIVED / RECEIVED correctly; audit written.

### 3.8 Employee management

- **Existing:** owner/manager can list employees and **create** manager/cashier accounts with a temporary password; invitation email contains no password; shifts start/close.
- **FAIL:** F-030 (no edit, suspend, role change, branch change, reset), F-029 (cashier shift access).
- **PARTIAL:** `User.isActive` is honoured at login and refresh, but nothing in the API can set it to false; suspended business/user access persists up to 15 minutes via the access token (F-006).
- **MISSING:** attendance reports, per-employee activity log view, forced password change on first login (temporary password remains valid indefinitely).

### 3.9 Multi-branch management

- **Existing:** branch create/edit, per-branch stock, transfers, branch summary (`/api/branches/[id]`), `branchScope` helper.
- **PARTIAL:** `branchScope` exists but the **sale and sales-list routes do not use it** (F-002, F-055); `/api/branches/[id]` has no package gate (F-053); consolidated multi-branch reporting beyond that summary is not evident.
- **UNVERIFIED:** branch deactivation behaviour, orphaned stock when a branch is removed.

### 3.10 Insight Store

Product decisions (brief) checked against code:

| Decision | Status | Evidence |
|---|---|---|
| One central multi-vendor marketplace | PASS | `app/store/**`, `lib/store/public.ts` |
| Sellers identified by registered business name | PASS | order and listing queries use `business.name` |
| No seller sites or custom domains | PASS | only a `store.` host rewrite in `middleware.ts` |
| Reuse existing catalogue and inventory | PASS | `StoreListing.productId`, stock from `InventoryLevel` |
| WhatsApp is the ordering channel; no integrated checkout | PASS | checkout builds `wa.me` links, charges nothing (`checkout/route.ts`) |
| Opening WhatsApp ≠ delivered/accepted/paid | PASS | status comes only from seller actions; `whatsappLinkGeneratedAt` is recorded, not "sent" |
| Seller approval ≠ product moderation ≠ verification | PASS | separate application, listing-moderation and review states |
| Sellers must confirm orders | PASS | state machine in `lib/store/core.ts`; stock deducted on confirm |

- **PASS:** conditional stock decrement on confirm; idempotent checkout; DB check constraints; seller/admin isolation (`requireSeller`, `requireAdmin`); shopper accounts; reviews limited to registered shoppers with completed orders (85/85 E2E today).
- **PARTIAL:** stock is **not reserved** between request and confirm, so several customers can request the last unit; the conflict is caught at confirm (by design, but sellers will see rejections). No rate limiting on guest cart, checkout or attribution endpoints (F-011).
- **UNVERIFIED:** listing moderation UI, notification delivery to customers (blocked by sender domain), image upload limits under load.

### 3.11 Authentication and security — see Section 5.

### 3.12 Notifications and email

- **In-app:** per-recipient rows with `dedupeKey` (no duplicates), read state, role-targeted recipients (`lib/notify.ts`). PASS.
- **Email:** outbox, retries, templates, webhook (signature verified, tested), delivery status, preferences, admin routing to the single central address, contact form with spam control. PASS by code and 30 unit tests.
- **FAIL/PARTIAL:** cron runs **once a day** so retries wait up to 24 hours (F-047); production sends from Resend's test sender, so nothing reaches customers until a domain is verified; test-email function needs the Super Admin password and was not exercised.
- Central address `stylintech.x@gmail.com` is used as Reply-To/contact/admin routing; no fictional mailboxes found.

### 3.13 Offline synchronisation — see Section 6.

### 3.14 Super Admin

- **Existing:** separate login, mandatory TOTP, DB-backed sessions, lockout, platform audit log, business list/detail/suspend/set package (reason required), Store applications/listings/orders/sellers/reviews moderation, email settings, notifications. 26 unit tests pass for core rules.
- **PARTIAL:** first sign-in enrols whichever authenticator the first successful password holder presents (F-007); most admin screens were not exercised.

---

## 4. Cross-service integration report

**Verdict.** Insight behaves as an integrated platform on the **write path** (a sale updates stock, movements, credit, audit atomically) but as separate modules on the **reporting and money path**.

| # | Relationship | Source of truth | Status | Gap |
|---|---|---|---|---|
| 1 | Inventory ↔ POS | `InventoryLevel` | PARTIAL | Decrement is atomic in the transaction but the check is not (F-016) |
| 2 | POS ↔ Sales | `Sale` + `SaleItem` | PASS | Same transaction, snapshots of price/cost |
| 3 | Sales ↔ Finance | `Sale.totalAmount`, `Expense` | PARTIAL | Accrual only; `Payment` rows misstate cash (F-023); no receivables/cash view |
| 4 | Inventory ↔ Purchasing | `Purchase` → `InventoryLevel` | PASS | Receive is transactional; limit check is outside it (F-031) |
| 5 | Purchasing ↔ Supplier balances | `Supplier.outstandingBalance` | FAIL | Increments only; no payment path |
| 6 | Sales ↔ Customers | `Sale.customerId` | PARTIAL | Customer ownership not validated (F-001) |
| 7 | Customer credit ↔ Finance | `Customer.creditBalance` (denormalised) + `CreditAccount` | PARTIAL | Two stores of the same balance can drift (F-024); not in any report |
| 8 | Employees ↔ Permissions | `User.role` in JWT | PARTIAL | Role changes impossible; 15-minute stale claims (F-006); shift permission mismatch (F-029) |
| 9 | Branches ↔ Inventory | `InventoryLevel(branch)` | PASS | — |
| 10 | Branches ↔ Sales reporting | `Sale.branchId` | PARTIAL | Branch not bound to the cashier (F-002); sales list not branch-scoped (F-055) |
| 11 | Inventory ↔ Insight Store | `StoreListing` → `InventoryLevel` | PASS | Conditional decrement on confirm |
| 12 | Store ↔ Seller orders | `StoreOrder` state machine | PASS | Tested (E2E) |
| 13 | Notifications ↔ modules | `notifyBusiness` | PASS | Used by stock, shifts, store, reviews |
| 14 | Store orders ↔ Sales/Finance | — | MISSING | A confirmed Store order deducts stock but **creates no `Sale`**, so marketplace revenue never reaches profit reports. Whether this is intended (WhatsApp channel, payment outside Insight) is a product decision to confirm. |
| 15 | Package ↔ Backend | `Business.appMode` | PASS (one gap) | `moduleGate` on all gated routes except `/api/branches/[id]` (F-053) |

---

## 5. Security and data protection report

**Verified protections:** secure-by-default middleware; per-route permission checks; tenant scope on all sampled queries; zod validation; hashed refresh and reset tokens; single-use reset tokens that revoke sessions; account lockout with owner notification; HMAC-verified webhooks (tested); cron endpoint uses timing-safe comparison of `CRON_SECRET`; httpOnly + SameSite=Lax + Secure cookies; admin console isolated with MFA; Vercel responds with HSTS.

| ID | Sev | Issue |
|---|---|---|
| F-001 | High | Cross-tenant write via `customerId` in sale |
| F-006 | Medium | Access tokens not revocable for up to 15 min; `getSession` ignores user and business status |
| F-007 | Medium | Admin MFA enrolment is first-come after password; production state UNVERIFIED |
| F-003 | Medium | No IP rate limiting on login/register; per-account lockout allows targeted lock-out |
| F-008 | Medium | No CSP, frame-ancestors/X-Frame-Options, Referrer-Policy or Permissions-Policy configured |
| F-011 | Medium | No rate limiting on public Store cart/checkout/attribution |
| F-009 | Medium | No lockfile; dependency vulnerability status UNVERIFIED |
| F-004/F-005 | Medium/Low | Email case not normalised; enumeration via register 409 and login timing |
| F-012/F-013/F-010/F-014/F-015 | Low | Refresh-reuse handling, token in URL, unthrottled error endpoint, literal HMAC fallback, no CSRF token beyond SameSite |

**Business isolation:** PASS on every route sampled (`businessId` in all `where` clauses), except the specific gaps above. **Seller isolation:** PASS (`requireSeller` binds to the session business). **Sensitive output:** reviews, orders and admin payloads were checked in earlier E2E for absence of shopper IDs/emails; logs include business/user ids in the client-error line only.
**Not performed:** penetration testing of production (out of scope by rule), dependency scan (registry unreachable here), secret scanning of git history (not run).

---

## 6. Offline and synchronisation report

**Classification: PARTIAL — genuinely offline-capable for cash/mobile-money sales; not for the rest of the business.**

- **Works (verified by code):** all POS sales are queued in IndexedDB first, sent in order, idempotent on `clientTxnId` (also DB-unique), distinguishes transient from definitive failures, recovers sales stuck in "syncing" after a closed tab, retries every 60 s, shows status ("Offline — N waiting", "Synchronizing"), keeps 401s pending until sign-in.
- **Limits:** credit sales are blocked offline (correct, because credit limits cannot be checked — but see F-019, they are not checked online either); no offline refunds, receiving, adjustments or customer payments; queue is **per device/browser** (clearing site data loses it; no cross-device visibility); catalogue cache is in `localStorage`.
- **Risks:** F-026 (sync-time prices differ from the printed offline receipt), F-027 (a stock conflict at sync leaves a real sale unrecorded with no "record anyway" path), F-028 (sales older than 7 days silently re-dated), F-041 (cache survives logout), F-016 (concurrent syncs from several devices race the unsafe stock check).
- **Doc drift:** `lib/offline/README.md` says "already recorded" returns 409; code returns 200 (the engine handles both).
- **No automated test exists for the queue or sync engine.** Offline reliability under real device restarts, Safari storage eviction and flaky networks is **UNVERIFIED**.

---

## 7. Performance report

**Nothing was measured.** No latency, bundle-size, query-plan or load numbers exist in this audit and none are estimated as fact. Observations only:

- **Measured fact:** the production build for commit `261f20a` took ~68 s on Vercel; the `/store` page returned 200 and the reviews endpoint 404-for-unknown-target at deploy time.
- **Design observations (estimates, unmeasured):** each dashboard load issues five API calls including two sales lists and a 100-product list (F-034) and recomputes aggregates in the browser; `GET /api/sales` includes joins on every row with no date window; report endpoints load all matching sales rows into memory to sum them (`reports/profit`), where `aggregate` would do; database is a 0.25-CU Neon compute that suspends and cold-starts (production URL carries a 20 s connect timeout).
- **Missing:** no caching headers strategy for API reads, no performance budget, no query monitoring. **UNVERIFIED:** bundle sizes, image optimisation, behaviour with thousands of products or sales.

---

## 8. User-experience report

Examined by code only; the UI smoke harness could not be run here (Section 14).

- **Misleading/inert controls:** Reports "Print / Export PDF / Export CSV" have no click handlers (F-036); POS says credit limits are checked when they are not (F-019); sample figures appear as if real (F-035); Reports/Dashboard sections say "not available yet" for three analytics.
- **Dead ends:** a cashier opening Shifts receives a permission error (F-029); owner cannot deactivate an employee or fix a typo in a customer (F-030, CRM edit missing).
- **Inconsistency:** every screen re-implements nav, theme and fetch logic (large single files, 500–1,100 lines); mobile behaviour was designed (smoke tests exist at 390 px) but not re-verified.
- **Strengths:** clear sync status in the POS; honest error text on conflicts; empty-state copy; Store pages have SVG stars with accessible labels.
- **UNVERIFIED:** keyboard navigation, contrast, screen-reader behaviour, real mobile devices, form error recovery.

---

## 9. Testing report

**Commands executed** (copy of repository tree was left untouched; bundles written outside the repo):

```
esbuild tests/unit/<name>.test.ts --bundle --platform=node  →  node <bundle>
(email.test.ts bundled with --alias:@/lib/prisma and @prisma/client → tests/unit/fake-prisma.ts, as its header instructs)
```

| Test file | Result |
|---|---|
| admin-core | 26 passed, 0 failed |
| application-rules | 13 passed, 0 failed |
| email | 30 passed, 0 failed, 0 skipped |
| locked-permissions | 2 passed, 0 failed |
| reviews-core | 5 passed, 0 failed |
| shopper-core | 10 passed, 0 failed |
| store-core | 36 passed, 0 failed |
| **Total** | **122 passed, 0 failed, 0 skipped** |

**Not run:** `npm install`, type-check, lint, build, E2E scripts, UI-smoke, `npm audit` — the npm registry is unreachable from this environment (`ENOTFOUND registry.npmjs.org`). Evidence for build/type validity: the production build of `261f20a` completed READY on Vercel (`next build` includes type-checking). E2E for reviews passed 85/85 earlier today against a preview (not re-run in this audit); other E2E scripts were not re-run.

**Coverage gaps (highest risk first):** POS sale creation, refunds/voids, stock adjust/transfer/receive, credit payments, shifts, supplier/purchase flows, offline queue, report calculations, role-permission matrix for the retail modules, package gating across routes, cross-tenant access attempts on retail routes. **No test in `tests/` calls `/api/sales`, `/reverse`, `/inventory/*`, `/purchases/*`, or `/customers/*` against real logic.** There is no CI, so even the passing tests run only when someone remembers to run them by hand.

---

## 10. Service quality scorecard

Dimension weights: Functional 20 · Reliability/integrity 20 · Security/permissions 20 · UX 15 · Performance 10 (**not measured, excluded**) · Integration 10 · Testing/maintainability 5. Scores below are out of 100 per dimension; the final score is renormalised over the 90 % that was assessed. "Evidence confidence" is how much of that service was read directly.

| Service | Functional (20) | Reliability (20) | Security (20) | UX (15) | Integration (10) | Testing (5) | Score /100* | Evidence confidence |
|---|---|---|---|---|---|---|---|---|
| Inventory | 70 | 45 | 70 | 65 | 70 | 30 | **61** | Medium |
| Point of Sale | 60 | 40 | 55 | 65 | 65 | 25 | **54** | Medium |
| Sales management | 55 | 55 | 75 | 60 | 70 | 20 | **60** | Medium |
| Business analytics | 40 | 35 | 75 | 50 | 60 | 10 | **49** | Medium |
| Financial management | 35 | 40 | 70 | 50 | 45 | 10 | **46** | Medium |
| Customer management | 55 | 45 | 55 | 60 | 60 | 15 | **52** | Medium |
| Supplier & purchasing | 40 | 45 | 70 | 55 | 55 | 10 | **50** | Medium |
| Employee management | 35 | 55 | 60 | 50 | 55 | 10 | **48** | Medium |
| Multi-branch | 50 | 50 | 55 | 50 | 60 | 10 | **50** | Low |
| Insight Store | 75 | 75 | 70 | 65 | 70 | 70 | **71** | Medium |
| Authentication & security | 70 | 65 | 55 | 60 | 70 | 40 | **62** | Medium |
| Notifications & email | 70 | 60 | 80 | 55 | 70 | 70 | **68** | Medium |
| Offline synchronisation | 60 | 55 | 50 | 65 | 60 | 15 | **55** | Medium |
| Super Admin | 70 | 65 | 75 | 60 | 65 | 55 | **67** | Low |

\* Not externally certified. Low-confidence rows (Multi-branch, Super Admin) are provisional and should be re-scored after a deeper pass.

**Why the scores are what they are**
- **Insight Store (71)** and **Notifications/email (68)** lead because they have atomic or idempotent writes, constraints, signed webhooks and real tests. Email's reliability is held down by daily-only retries and the unverified sender domain.
- **Super Admin (67, provisional)** has real defence in depth (MFA, lockout, audit, separation) but limited review.
- **Authentication (62)** is solid in design; held back by missing IP throttling, security headers, stale-claim window and no lockfile.
- **Inventory (61) / Sales (60)** work end to end but race conditions and missing flows cost reliability; tests are absent.
- **POS (54) and Offline (55)** have an excellent queue design undermined by server-side correctness gaps.
- **Customers (52), Suppliers (50), Multi-branch (50), Employees (48), Analytics (49), Finance (46)** are the weakest: missing flows (edit, suspend, supplier payments, receivables), unenforced limits, and reporting that is truncated or placeholder.

---

## 11. Prioritised findings register

ID | Finding | Service | Severity | Evidence | Business impact | Recommended action
---|---|---|---|---|---|---
F-016 | POS stock check is read-then-write; DB has no `quantity >= 0` check | POS / Inventory | **High** | `app/api/sales/route.ts` (reads levels, later `decrement`); `InventoryLevel.quantity Int` with no CHECK in any migration; contrast conditional `updateMany` in `lib/store/orders.ts` | Negative stock, overselling, wrong valuation under two cashiers or POS + Store | Use conditional `updateMany({ where: { quantity: { gte } } })` and fail the sale on count≠1; add `CHECK (quantity >= 0)` migration after cleaning data |
F-017 | Stock adjustment writes an absolute value from a stale read | Inventory | **High** | `app/api/inventory/adjust/route.ts` (`quantity: current + delta`) | A sale made during an adjustment is silently overwritten | Use increments with a conditional guard, or row lock (`SELECT … FOR UPDATE`) |
F-018 | Transfer check-then-decrement race | Inventory | Medium | `app/api/inventory/transfer/route.ts` | Negative source stock | Same atomic pattern as F-016 |
F-019 | Credit limit never enforced server-side; POS says it is | POS / CRM | **High** | `grep creditLimit` finds it only in customer create and UI; `components/pos.jsx` offline message claims a check | Unlimited customer debt; trust loss when the UI says otherwise | Enforce `creditBalance + total ≤ creditLimit` inside the sale transaction; align UI text |
F-023 | Credit sale writes a full-amount `Payment`; refund of it writes a negative full payment | Sales / Finance | **High** | `sales/route.ts` payments.create; `reverse/route.ts` REFUND branch | Cash-received and refund figures wrong; any payment-based report misstates cash | Record payments only for money actually received; refund only what was paid; support partial refunds |
F-001 | `customerId` not checked against business | POS | **High** | `sales/route.ts` creates `creditAccount` and `customer.update` by raw id | One tenant can alter another tenant's customer balance if an id leaks | Look up customer with `tenantScope`; reject otherwise |
F-034 | Analytics aggregated in browser from last 100 sales / first 100 products | Analytics | **High** | `components/dashboard.jsx` (`/api/sales?limit=200`, `salesTrendData`, `inventoryValue`); server clamp `Math.min(100, …)` in `sales/route.ts`; `products` pageSize max 100 | Trends, valuation and "low stock" wrong for any shop beyond 100 sales/products | Server-side aggregate endpoints (daily sales, inventory valuation) with proper date windows |
F-029 | Cashiers cannot open/close own shifts | Employees / POS | **High** | `shifts/route.ts` and `shifts/[id]/end/route.ts` require `employees:read`; `ROLE_PERMISSIONS.CASHIER` lacks it; code comment says cashiers can | Cash reconciliation unusable by the people who handle cash | Add a `shifts:own` permission; also include float, cash expenses and cash customer payments in expected cash |
F-030 | No employee edit, suspend, role/branch change, or password reset by owner | Employees | **High** | `app/api/employees/route.ts` only GET/POST; no `user.update` of `isActive` anywhere | Cannot remove a dismissed cashier except by Super Admin or DB | Add PATCH (role, branch, active) with audit; revoke refresh tokens on deactivate |
F-042 | Backups: 6-hour Neon history, no snapshot/export schedule, restore never tested | Operations | **High** | Neon `history_retention_seconds: 21600`, free plan | A bad migration or deletion noticed after 6 h is unrecoverable | Paid plan or scheduled `pg_dump` to separate storage; run and document one restore test |
F-044 | No privacy notice, terms or consent capture; no data-subject request process for business users | Compliance | **High** | `app/` has no `/privacy` or `/terms`; no consent in `components/login.jsx` register flow | Act 843 documentation gap; DPC registration still pending (known) | Draft notices with a Ghana lawyer; add consent text and a request channel; document retention |
F-035 | Hard-coded sample figures shown on failure/while loading | Analytics | Medium | `components/dashboard.jsx` `profitSummary?.revenue ?? 5680`, `?? 1870`, `?? 86`, `inventoryValue ?? 184_320`; `components/reports.jsx` `?? 334`, `184320`, `23`; banner only on thrown network error | Owners may read invented revenue as real | Replace with skeleton/error states; delete the sample constants |
F-036 | Report export buttons are inert; no CSV export/import anywhere | Analytics / Inventory | Medium | `components/reports.jsx` `ExportBar` buttons have no `onClick`; no CSV code elsewhere | Advertised capability does not work | Implement CSV export (sales, stock, customers) first; hide PDF until built |
F-020 | Receipt number = count + 1 | POS | Medium | `nextReceiptNumber` in `sales/route.ts`, unique `(businessId, receiptNumber)` | Concurrent sales collide → 500 | Per-business counter row (atomic increment) or sequence |
F-021 | Idempotency pre-check then create; duplicate race returns 500 | POS | Medium | `sales/route.ts` | Online cashier sees an error after the first request succeeded | Catch `P2002` on `clientTxnId` and return the existing sale |
F-022 | Void/refund status check not locked | Sales | Medium | `reverse/route.ts` | Double click/two devices return stock twice | Conditional `updateMany({ where: { status: "COMPLETED" } })` |
F-024 | Customer payment balance check outside tx; denormalised balance | CRM | Medium | `customers/[id]/payments/route.ts` | Over-payment, drift between `Customer.creditBalance` and accounts | Move reads in tx, lock customer row; derive balance from accounts |
F-025 | Line discount unbounded; no discount permission | POS | Medium | `SaleItemSchema.discount: nonnegative()` only; `discountPercent` up to 100 for any cashier | Negative totals; 100 % discounts by any cashier | Cap discount ≤ line total; permission/threshold for manager approval |
F-026 | Offline sales priced at sync time | Offline | Medium | Payload has only productId/quantity; server uses current `sellingPrice` | Printed receipt ≠ recorded sale after a price change | Send unit price snapshot; accept within tolerance and flag differences |
F-027 | Stock-conflict at sync leaves a real sale unrecorded | Offline | Medium | `sync-engine.ts` `rejected` → `failed`; server has no "force" path | Missing revenue and stock mismatch | Add manager "record anyway" that books negative-stock exception with audit |
F-031 | No supplier payments, PO approval, cancel or edit; receive limit outside tx | Suppliers | Medium | only `GET/POST purchases`, `receive`; `outstandingBalance` only incremented | Payables never decrease; cannot cancel an erroneous PO | Add supplier payment ledger, PO cancel/approval, transactional receive |
F-032 | Cost basis = last purchase cost | Inventory / Finance | Medium | `receive/route.ts` comment and `product.update({ costPrice })` | Profit swings with each purchase; wrong margin on remaining stock | Weighted-average cost option |
F-033 | No time-zone handling; `to` date excludes the day; invalid date → 500 | Analytics | Medium | no timezone field/usage; `reports/profit` `new Date(from/to)` | Wrong day boundaries for Ghana (UTC) users abroad or midnight sales | Business timezone setting; inclusive end-of-day; validate params |
F-002 | `branchId` from the client not bound to cashier | POS / Branches | Medium | `sales/route.ts` | Cashier books sales/stock against another branch of the same business | Enforce `session.branchId` for cashiers via `branchScope` |
F-055 | Cashiers can list every branch's sales | Sales | Medium | `GET /api/sales` uses `tenantScope` only | Privacy and accountability between branches | Use `branchScope` for cashiers |
F-053 | `/api/branches/[id]` returns revenue/profit with no package gate | Package enforcement | Low | route has no `moduleGate`, aggregates sales/expenses | Data visible after downgrade | Add `moduleGate("finance")` for the financial fields |
F-006 | Access token not revocable; getSession ignores user/business status | Auth | Medium | `lib/tenant.ts` checks only `awaitingApproval` | Suspended staff keep access ≤ 15 min | Re-check `isActive` and business status (cached) in `getSession` |
F-007 | Admin MFA enrolment open to first password holder | Super Admin | Medium | `admin/auth/login/route.ts` enrol branch when `!mfaEnabled` | If a Super Admin account is not yet enrolled, password alone enables takeover | Enrol every admin immediately; require a one-time enrolment code; production state UNVERIFIED |
F-003 | No IP rate limit on login/register; lockout can be abused | Auth | Medium | `auth/login/route.ts` counts per-user audit rows; `rateLimited` unused here | Anyone can lock a known user for 15 min | Add IP + email limiter; keep lockout but notify |
F-004 | Email not lower-cased on register/login/employee create | Auth | Medium | `RegisterSchema.email`, `LoginSchema.email` vs lower-casing in forgot-password | "Bob@x.com" cannot reset password; duplicate accounts by case | Normalise (trim, lower-case) everywhere; migrate existing |
F-008 | No security headers set by the app | Security | Medium | `next.config.js` has none; `vercel.json` none | Clickjacking and weaker XSS containment | Add CSP, frame-ancestors, Referrer-Policy, Permissions-Policy |
F-009 | No lockfile, caret ranges | Platform | Medium | repo root; `package.json` | Non-reproducible builds, silent upgrades | Commit lockfile; pin Next/Prisma |
F-011 | Public Store endpoints unthrottled | Store | Medium | `rateLimited` used only in reviews, auth-email and contact | Order spam; email bombing sellers | Per-IP limits on cart/checkout/attribution |
F-045 | No CI, no lint, no test script; core retail untested | QA | Medium | no `.github`, no ESLint config, `package.json` scripts | Regressions reach production unseen | Add workflow: install, type-check, unit tests, build; write retail tests (Section 12 Phase A) |
F-046 | No error/uptime monitoring or analytics | Operations | Medium | no monitoring dependency; errors only `console.error` | Outages and failures go unnoticed | Add error tracking and uptime check on `/api/health`; privacy-conscious analytics |
F-047 | Email retries only once a day; production uses test sender | Email | Medium | `vercel.json` cron `0 5 * * *`; no `EMAIL_FROM_ADDRESS` in Production | Delayed or undeliverable customer mail | Verify a domain; retry in-request or via a more frequent trigger |
F-041 | POS cache (catalogue, customers, session) not cleared on logout | Offline / Privacy | Medium | `insight_pos_cache_v1` written in `pos.jsx`, never removed; `logout` only clears cookies | Customer data left on shared devices | Clear caches on logout; encrypt or minimise |
F-037 | Category profit, product profitability, stock discrepancy not implemented; no stock-count workflow | Analytics / Inventory | Medium | UI states "not available yet" | Core BI promise unmet | Add item-level aggregation endpoints and stock counts |
F-039 | Owners cannot view their audit log | Employees / Security | Medium | audit rows written everywhere; only `admin/businesses/[id]` reads 25 | Accountability exists on paper only | Owner audit-log screen with filters |
F-043 | Data hosted in US regions (Neon us-east-1, Vercel iad1, Resend) | Compliance | Medium | Neon `region_id aws-us-east-1`; deployment region iad1 | International-transfer basis must be documented (Act 843) | Legal review; consider region choice and DPAs |
F-050 | Large untyped client components; duplicated navigation/theme/fetch | Maintainability | Medium | `components/*.jsx` 500–1,100 lines each | Slow, risky changes; no compile-time safety | Extract shared shell/hooks; migrate screens to TS gradually |
F-051 | No billing/subscription/payment integration | Billing | Medium | no subscription model or payment code | Cannot charge customers | Product decision, then provider integration |
F-054 | Next 14 / React 18 / Prisma 5 are older majors; vulnerability status unknown | Platform | Medium | `package.json`; audit blocked | Possible known issues unpatched | Run audit in CI; plan upgrades |
F-005 | Enumeration via register/employee 409 and login timing | Auth | Low | `register/route.ts`; login returns before bcrypt for unknown email | Account discovery | Constant-time dummy hash; generic message where UX allows |
F-010 | `/api/client-errors` public, unthrottled, logs content | Security | Low | route file | Log flooding/cost | Rate limit; drop unauthenticated bodies |
F-012 | Refresh rotation: no reuse detection; concurrent tabs can sign each other out | Auth | Low | `auth/refresh/route.ts` clears cookies on revoked token | Random logouts | Grace window for the previous token; revoke family on reuse |
F-013 | Store order token in URL query; origin from `x-forwarded-host` | Store | Low | `checkout/route.ts` | Token leakage via referrer/history | Move token to a cookie/POST; fix origin to configured URL |
F-014 | HMAC fallback secret literal when `JWT_SIGNING_SECRET` unset | Store | Low | `checkout/route.ts` | Predictable token if misconfigured | Fail closed |
F-015 | No CSRF token (relies on SameSite=Lax) | Auth | Low | `lib/auth.ts` `cookieOptions` | Acceptable today; fragile if CORS/cookies change | Document; add Origin check |
F-028 | `occurredAt` older than 7 days silently replaced | Offline | Low | `sales/route.ts` | Wrong dates | Return a warning or reject |
F-038 | Profit sums use JS numbers, not Decimal | Analytics | Low | `reports/profit/route.ts` | Rounding drift at scale | Use `aggregate`/Decimal |
F-040 | `limit=abc` → NaN → 500 | API | Low | `sales/route.ts` `Number()` (code-evident) | Noisy 500s | Validate query params with zod |
F-048 | Stale preview env vars with secrets (six branches) | Operations | Low | Vercel env list: preview vars for deleted branches; several marked "REVOKED" | Secret hygiene | Delete them |
F-049 | Documentation drift (`ARCHITECTURE.md`, offline README) | Maintainability | Low | see Section 2 | Misleading onboarding for developers | Update docs |
F-052 | Support is a contact form only; no help docs or ticketing found | Support | Low | `app/contact`, no help route | Slow support at scale | Help centre + shared inbox process |

---

## 12. Recommended improvement roadmap

Complexity: Small · Medium · Large · Very Large.

### Phase A — Critical fixes (protect money and stock)
| # | Problem | Solution | Complexity | Dependencies | Tests required |
|---|---|---|---|---|---|
| A1 | F-016/017/018 stock atomicity | Conditional updates, CHECK constraint, clean data first | Small | A backup (A7) | Concurrency test: N parallel sales/adjust/transfer never yield negative stock |
| A2 | F-001/019/002/025 sale validation | Ownership checks, credit-limit, branch binding, discount caps in one transaction | Small | — | Unit + route tests incl. cross-tenant attempt |
| A3 | F-023/022/021/020 payments & reversal | Real-cash payments only, partial refund, conditional reversal, receipt counter, `P2002` handling | Medium | A2 | Refund of credit/cash/partial; double-reverse; parallel duplicate txn |
| A4 | F-035/036 honesty in UI | Remove sample figures; make exports work or hide them | Small | — | UI smoke with failed API |
| A5 | F-029/030 staff access | Cashier shift permission; employee edit/suspend/role; revoke tokens | Medium | F-006 | Role matrix test |
| A6 | F-009/045 repo safety | Lockfile; CI running unit tests, type-check, build | Small | — | CI green on PR |
| A7 | F-042 backups | Scheduled dump + one tested restore | Small | — | Documented restore drill |

### Phase B — Platform foundations
F-006 live session status check · F-003/F-011/F-010 rate limiting · F-008 security headers · F-004/F-005 email normalisation · F-046 error/uptime monitoring · F-050 shared app shell and gradual TS migration · F-048/F-049 hygiene. *Medium overall.* Tests: auth matrix, header snapshot, lockout.

### Phase C — Core service improvements
F-031 supplier payments, PO approval/cancel; F-032 weighted-average cost; F-024 customer-ledger integrity; F-026/027 offline pricing and conflict resolution; F-039 owner audit log; F-055/F-053 branch and package scoping; CRM edit/merge; product import/export. *Large.* Tests: end-to-end retail workflow suite (sell → refund → receive → pay supplier → report).

### Phase D — Analytics and automation
Server-side aggregates (daily, by product, by category, by cashier, by branch), business timezone, receivables/payables ageing, cash-flow view, stock counts with discrepancy reports, working exports, reorder suggestions. *Large.* Tests: report totals reconcile to raw sales in fixtures.

### Phase E — Customer experience and growth
Verified sending domain and customer email; Store payments decision; ratings in seller dashboards; onboarding checklist; help centre; analytics; billing/subscriptions (F-051) once pricing is decided. *Medium to Very Large (billing).*

### Phase F — Scalability and international readiness
Region/DPA review (F-043), read replicas or caching for reports, multi-currency/tax (VAT/levies, `taxAmount` is currently 0), i18n, load testing with measured baselines, dependency upgrades (F-054). *Large to Very Large.*

---

## 13. Implementation order (least destabilising)

1. **A6 CI + lockfile + A7 backup** first, so every later change is tested and recoverable.
2. **Write the missing retail tests against current behaviour** (characterisation tests for sales, reverse, adjust, transfer, receive, payments, shifts), including concurrency tests that currently **fail** and document F-016/017.
3. **A1–A3** (stock and sale integrity), one migration at a time, each applied to a disposable Neon branch before production.
4. **A4–A5** (honest UI, staff access).
5. **Phase B** security hardening.
6. **Phase C then D**; do not start analytics before the data it reads is trustworthy.
7. **Phase E/F** after a supervised pilot confirms real usage patterns.

Each stage ships separately, with the usual disposable-branch preview test, production migration by hand, then merge.

---

## 14. Unverified areas

| Area | Why unverified | What is needed |
|---|---|---|
| Type-check, lint, build, `npm audit` locally | npm registry unreachable from the audit environment | Network access to npm, or run in CI |
| Dependency vulnerabilities | same | `npm audit` output |
| E2E scripts (store, shopper, email, package-signup) | need a deployed target and share token; only reviews E2E (85/85) was run earlier today | Run in a sandbox against a disposable preview |
| UI smoke, mobile layout, accessibility, keyboard use | require Playwright harness and installs | Run `tests/ui-smoke`, add axe checks, real-device test |
| Performance, bundle size, query plans | no measurements taken | Lighthouse/RUM, `EXPLAIN ANALYZE`, load test with fixtures |
| Concurrency defects F-016/017/018/021/022/024 | code-evident, not reproduced | Parallel-request tests on a disposable branch |
| Backup restore, Neon snapshots | no evidence of a restore test; plan limits not changed | A restore drill |
| Super Admin production MFA state | requires viewing the admin record | Super Admin confirms enrolment |
| Email delivery to real customers, bounce handling, webhook in production | blocked by unverified sender domain | Verified domain and a delivered test |
| Seller listing moderation, image handling, most admin screens, branch deactivation | not read in depth | Targeted review |
| Production data quality (orphans, negative stock, duplicate emails by case) | production data was deliberately not queried | Read-only SQL checks with owner approval |
| Printing on thermal hardware, barcode scanners | needs devices | Device test |
| Legal compliance (Act 843), tax/VAT, GRA requirements | needs professional advice | Lawyer and accountant review |

---

## 15. Final recommendation

Do not market or operate Insight as a dependable commercial SaaS yet. Before it can be, **six things must be true**:

1. Stock and money writes are atomic, constrained in the database, and covered by automated concurrency tests (A1–A3).
2. Reports and the dashboard show only real, complete, server-computed numbers (A4, Phase D).
3. Staff can be managed and cashiers can run their own shifts (A5).
4. Every change is built and tested automatically from a locked dependency set, with monitoring in place (A6, F-046).
5. There is a tested way to recover data (A7).
6. A privacy notice, consent text and data-request process exist, reviewed by a Ghanaian lawyer, and DPC registration is completed (F-044).

Insight Store and the email system can proceed to a limited public launch as soon as a sending domain is verified and the Store rate limits (F-011) are added. The retail core should run only in a **supervised pilot** until Phase A is finished.

*Audit first, report second: no application change was made. The changes above need your approval and will be done one stage at a time.*
