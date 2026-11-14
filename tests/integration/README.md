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

## Regression guards

`regression(id, name, cond)` guards an audit finding fixed in Phase A. Each was
first written to fail against the original code (baseline CI run 43606686442
recorded them as XFAIL) and must now pass; a failure means the defect is back.

Tests never change their expectation to make a defect pass.
