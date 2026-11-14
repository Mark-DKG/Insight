# Integration tests (Phase A)

Drive a real Insight server over HTTP and assert on stored rows with Prisma.
**They create businesses, stock and sales: only run them against a disposable
database, never production.**

```bash
export DATABASE_URL=<disposable Neon branch or local Postgres>
npx prisma migrate deploy
npm run build && npm start &            # or: npm run dev
BASE=http://localhost:3000 npm run test:integration
```

## Known-defect tests

`defect(id, name, cond)` records a regression test for an audit finding that is
**expected to fail until the fix lands**:

- `XFAIL` – defect still present (does not fail the run).
- `XPASS` – the defect is fixed; promote the check to `check()`.
- `STRICT=1` – treat every `XFAIL` as a failure (used once all fixes are in).

Tests never change their expectation to make a defect pass.
