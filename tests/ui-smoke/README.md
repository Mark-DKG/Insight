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
for d in empty full; do for m in FULL INVENTORY_ONLY; do node tests/ui-smoke/run.js $m $d; done; done
node tests/ui-smoke/fuzz.js FULL full && node tests/ui-smoke/fuzz.js FULL empty
```

Last run (2026-11-11): 10 screens, 2 widths, 2 datasets, both modes, all passing.
The click-fuzz made about 1,250 clicks with 0 crashes.
