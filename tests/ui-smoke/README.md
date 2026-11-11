# UI smoke tests

Renders every screen in headless Chromium against a mocked API, without a
server or database, and fails on any crash.

- `run.js`: initial render at desktop (1440) and phone (390) widths.
- `fuzz.js`: clicks every button, tab and row on each screen.
- `mock.js`: an empty business, matching what the live API returns for a new owner.
- `mock-full.js`: a populated business (supplier, products, credit customer,
  sales in every status, a purchase and an expense).

Icons, charts and the Next.js router are stubbed, so chart rendering itself is
not covered.

```bash
npm i --no-save esbuild playwright react@18 react-dom@18 && npx playwright install chromium
node tests/ui-smoke/build.js
for d in empty full; do for m in FULL INVENTORY_ONLY STORE_INVENTORY POS_INVENTORY; do node tests/ui-smoke/run.js $m $d; done; done
node tests/ui-smoke/fuzz.js FULL full && node tests/ui-smoke/fuzz.js FULL empty
node tests/ui-smoke/admin.js
```

Screens are listed in `screens.json`. `store-cart`, `store-order` and `store-product`
render the marketplace's client components through wrappers in `screens/`.

## End-to-end (real build + real database)

`tests/e2e/store-e2e.mjs` drives the whole Insight Store flow over HTTP against a
running build: registration, package request, application, documents, admin review
with MFA, listings, public catalog and pages, multi-seller cart and idempotent
checkout, WhatsApp links, concurrent confirmations, payment, cancel/restore,
expiry, suspension and package hiding, notifications and cross-tenant checks.
Run it only against a disposable database branch:

```bash
DATABASE_URL=<test branch> JWT_SIGNING_SECRET=... PLATFORM_ADMIN_SECRET=... npm run build && npx next start &
ADMIN_EMAIL=e2e-admin@example.test ADMIN_PASSWORD=... node tests/e2e/make-admin.mjs
BASE=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/e2e/store-e2e.mjs
```

Last run (2026-11-11): 14 screens, 2 widths, 2 datasets, all four packages, all passing;
admin console 6 screens × 5 scenarios passing. E2E: 116 checks passing.
