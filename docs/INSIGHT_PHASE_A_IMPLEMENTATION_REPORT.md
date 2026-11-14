# Insight by 9DEVs — Phase A Implementation Report

Critical business integrity and operational safety. Branch `phase-a` of `Mark-DKG/Insight`, head at the time of writing = the commit that adds this report.

**Evidence rule used throughout.** A finding is "Resolved" only where a test that fails (or is shown to be masked) against the original code now passes, or where the change is a database constraint whose rejection is itself tested. Everything else is marked Partially resolved, Not resolved or Blocked. No result in this report is estimated.

- Baseline CI run (original code, characterisation + defect tests): GitHub Actions run **43606686442**.
- Final CI run (all Phase A changes): GitHub Actions run **43607760343** — typecheck, 36 unit tests, migrations 0–11 applied in numeric order to a fresh Postgres 17, production build, server start, and 149 integration checks (43 + 22 + 14 + 70), **0 failed**.

---

## A. Executive summary

**What was done.** A reproducible install and CI pipeline was built first, with a real Postgres integration environment. Defects were then reproduced against the *unchanged* code before any fix. Stock movement, sale validation, payments/refunds, employee management and honest UI states were then fixed in staged commits, and the same tests were re-run.

**Baseline vs final.** At baseline, 19 of the audit-derived checks failed (9 + 5 + 5, see sections B and G). In the final run all of them pass, together with the new workflow, permission and concurrency suite (70 checks).

**What is NOT done, plainly.**
1. **Nothing has been applied to production.** Migration 11 was applied to the CI database and to a disposable Neon branch copied from production; production itself is unchanged. No deployment to production or merge to `main` has happened.
2. A Vercel **preview deployment has not been tested** (required by the plan before production).
3. **No off-platform backup exists.** A Neon snapshot was taken and a restore into a separate branch was verified, but that is recovery *inside Neon only*.
4. Employee edit / suspend / role / branch change and cashier shifts are fixed **in the API and tested there**; the Employees and Shifts screens have **no new controls** for them yet.
5. Dashboard and reports still aggregate in the browser; Phase A made that **honest** (labels, no invented numbers), it did not move the aggregation to the server.
6. UI changes (A4) are verified by parse, typecheck and build only. There is no automated browser test.

**Readiness:** see section L. Short version: the money and stock logic is ready to be promoted to a *preview* and then production after owner approval of the steps in section J; it is not ready to be called complete until the items in section I are accepted or closed.

---

## B. Finding resolution table

| ID | Finding | Status | Evidence |
|---|---|---|---|
| F-016 | POS stock check read-then-write; no DB floor | **Resolved** (with caveat) | Sale now decrements with one conditional `UPDATE … WHERE quantity >= n`. Baseline parallel-sale test *passed* but was **masked** by F-020 (most requests crashed with 500 before touching stock). With F-020 fixed the same test, plus the mixed sale/transfer race in `workflow.mjs`, passes with no 500s and exact reconciliation. DB constraint `InventoryLevel_quantity_nonnegative` added; test "database rejects negative inventory quantity" failed at baseline and passes. |
| F-017 | Adjustment writes absolute value from stale read | **Resolved** (with caveat) | Adjustment now locks the row (`FOR UPDATE`) and applies a delta. Baseline test passed but was masked as above; now passes alongside the 8-round sale-vs-adjust race and the sale/void/adjust race. |
| F-018 | Transfer check-then-decrement race | **Resolved** | Baseline: 9 of 10 parallel transfers succeeded and source went to **-4**. Now at most 5 succeed and the source never goes negative; deterministic lock ordering; no 500s in the mixed race. |
| F-020 | Receipt number collision → 500s under concurrency | **Resolved** | Baseline: 2 of 10 parallel sales succeeded, the rest 500. Now all 10 succeed with unique receipt numbers (per-business advisory lock held until commit). |
| F-021 | Duplicate offline `clientTxnId` → 500 | **Resolved** | Baseline `[500,500,500,201,500,500]`. Now every caller receives the one sale; a reused id with a different payload is refused. |
| F-001 | Cross-tenant write: another business's `customerId` in a sale | **Resolved** | Baseline: 201 and the other business's balance changed 0 → 10. Now rejected; balance untouched. |
| F-002 | Branch not validated / not bound to cashier | **Resolved** | Cross-business branch was already rejected at baseline (those checks passed). Phase A added the missing case: a cashier assigned to a branch cannot sell in another branch of their own business (403, no sale row written; tested in `workflow.mjs`). |
| F-019 | Credit limit never enforced | **Resolved** | Baseline: sale taking balance to 200 over a 150 limit returned 201. Now rejected, enforced under a row lock on the customer; parallel credit sales cannot exceed the limit. A customer with limit 0 cannot buy on credit (decision D1, section I). |
| A2 | Line discount larger than line total created a negative sale | **Resolved** | Baseline: 201 with total **-490**. Now 400. Percent discount >100 rejected; 10% discount yields the exact total and matching payment. |
| F-023 | Credit sale recorded phantom cash; refund paid out unpaid credit | **Resolved** | Baseline: 200 recorded as cash on a credit sale; refund paid out 200 of which only 80 was received. Now a credit sale records no cash; refunds pay out only money actually received (verified 150 of 200 in the part-paid case). |
| F-022 | Reversal race (double void / refund) | **Resolved** | Baseline: 6 of 6 rounds had multiple successes and wrong stock. Now exactly one succeeds per round, stock returns exactly once; refunding twice is refused. |
| F-024 | Payment check outside transaction; negative balances | **Resolved** | Baseline: 5 parallel payments of the full 100 owed drove the balance to **-400**. Now never negative; DB constraint `CreditAccount_amountPaid_within_original` added. |
| F-029 | Cashiers could not open/close their own shift | **Partially resolved** | New permission `shifts:own`. API tests pass: cashier opens/closes own shift, sees only own shifts, cannot open or close another's. **No UI change** was made, so the Shifts screen behaviour for cashiers is untested. |
| F-030 | No way to edit / suspend / change role / branch | **Partially resolved** | New `PATCH /api/employees/[id]` with the authority rules in section F (permission matrix). Suspension blocks both an existing session and a new login immediately (session now validated against the database per request); reactivation works; sales history stays intact. **No UI controls** were added. |
| F-035 | Fake sample numbers shown when requests fail | **Partially resolved** | Sample fallbacks removed from dashboard, reports, customers, inventory, purchases, expenses and settings; replaced by loading / error states with Retry; expenses shows "—" instead of an invented 12,470 profit. Verified by code search, typecheck and build. **No automated UI test.** Screens not examined in Phase A may still contain fallbacks. |
| F-036 | Inert Print/Export buttons | **Partially resolved** | Reports: Print / Save-as-PDF (browser print) and CSV export of what the active tab shows are wired. Not exercised by an automated test. |
| F-034 | Client-side aggregation over truncated data | **Not resolved** | Only mitigated: screens now say "Based on the latest 100 sales" / "First 100 products". Server-side aggregation was out of Phase A scope. |

Not in this table because not attempted: all other audit findings (Phases B–F).

---

## C. Files modified

Application code: `app/api/sales/route.ts`, `app/api/sales/[id]/reverse/route.ts`, `app/api/inventory/adjust/route.ts`, `app/api/inventory/transfer/route.ts`, `app/api/customers/[id]/payments/route.ts`, `app/api/employees/[id]/route.ts` (new), `app/api/employees/shifts/route.ts`, `app/api/employees/shifts/[id]/end/route.ts`, `lib/stock.ts` (new stock primitives), `lib/rbac.ts`, `lib/tenant.ts`.
Screens: `components/dashboard.jsx`, `reports.jsx`, `customers.jsx`, `inventory.jsx`, `purchases.jsx`, `expenses.jsx`, `settings.jsx`, `pos.jsx` (unused demo constant removed).
Database: `prisma/migrations/11_phase_a_integrity/migration.sql`.
Tooling and tests: `.github/workflows/ci.yml`, `scripts/run-unit-tests.mjs`, `scripts/apply-migrations.sh`, `package.json` / `package-lock.json` (lockfile added; `esbuild` dev dependency), `tests/integration/*` (`_lib`, `stock-sales`, `finance`, `employees`, `workflow`, `run-all`, README).
Docs: `docs/BACKUP_AND_RECOVERY.md`, `docs/INSIGHT_COMPREHENSIVE_AUDIT_REPORT.md`, this report.

---

## D. Database changes

Migration `11_phase_a_integrity` (additive; no data is read or changed):

```sql
ALTER TABLE "InventoryLevel" ADD CONSTRAINT "InventoryLevel_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "CreditAccount"  ADD CONSTRAINT "CreditAccount_amountPaid_within_original" CHECK ("amountPaid" >= 0 AND "amountPaid" <= "originalAmount");
```

Pre-checks (both must return 0 rows before applying anywhere): negative `InventoryLevel.quantity`; `CreditAccount` rows with `amountPaid < 0` or `> originalAmount`.

Tested on: (1) fresh CI Postgres 17 as part of migrations 0–11 (run 43607760343), where the negative-stock rejection is exercised; (2) disposable Neon branch `migration-test-phase-a-11` (`br-autumn-cell-awow39od`), created from production on 2026-11-14: pre-checks returned 0 / 0, both constraints applied and were confirmed in `pg_constraint`. **That branch held no sales, products, stock or credit rows** (production has none), so this proves the statements apply on the production schema, not that they tolerate real historical data. **Re-run the pre-checks immediately before production.**

Not applied to production. Production `_prisma_migrations` lists only migrations 0–5; migrations 6–10 were applied by hand earlier, so production is migrated with the SQL, **not** with `prisma migrate deploy` (see section J).

**Migration ordering defect found:** `prisma migrate deploy` sorts `10_` before `1_`, which broke CI. CI and the instructions below use `scripts/apply-migrations.sh` (numeric order). Renaming the folders with zero-padded prefixes is a recommended follow-up (not done: would rewrite migration history).

**Historical data.** Production has no sales or payments, so there are no legacy phantom-cash `Payment` rows (F-023) to reconcile there. Any other deployment should run, read-only, before relying on cash figures: payments attached to sales whose `paymentMethod = 'CREDIT'`. Nothing in Phase A rewrites such rows.

---

## E. Financial integrity verification

Money model after Phase A: a `Payment` row exists only for money actually received at sale time (non-credit sales). Credit sales create a `CreditAccount`; collections are `CreditPayment`s. A void/refund reverses only money received and removes only unpaid credit. Partial refunds are **not** implemented (whole-sale reversal only, as before).

Verified by tests (all in run 43607760343):
- Cash sale: one payment equal to the total. Discounted 10% sale: payment equals the discounted total.
- Credit sale of 200: balance 200, **no** payment row; two partial payments (50 and 100): account 150 of 200, balance 50; a payment of 60 (over what is owed) rejected.
- Refund of that part-paid sale pays out exactly 150, returns balance to 0 and restores stock; a second refund is refused.
- Credit limit: limit-0 customer refused; 200 + 100 over a 250 limit refused with stock and balance untouched.
- 20-step retail day (`workflow.mjs`): cash received = 80 (cash sale 80 + discounted 20 − voided 20), customer payments 120, balance owing 80, receipt numbers unique; profit report responds 200.

Not verified: that the *profit report's definition* is right. It still uses accrual revenue (including unpaid credit). Phase A did not add or change analytics definitions (A4.3 scope: no new analytics).

---

## F. Inventory integrity verification and permission matrix

**Stock.** After the 20-step day, stock for every product/branch equals the sum of its `InventoryMovement` rows (checked per product/branch). Mixed concurrency: 8 sales + 4 transfers on 10 units reconcile exactly (remaining + sold + moved = 10, destination = moved, nothing negative, no 500s). Sale + 2 concurrent voids + adjustment race: exactly one void wins, stock reconciles. The new database constraint is the last line of defence.

**Permissions (as implemented and tested).**

| Action | Owner | Manager | Cashier |
|---|---|---|---|
| Record sale | yes | yes | yes, **own branch only** |
| Adjust stock / transfer | yes | yes | no (403) |
| Void / refund | yes | yes | no (403) |
| Create employee | yes | no | no |
| Edit cashier (name, branch, suspend/reactivate) | yes | yes | no |
| Change anyone's role | yes (to Manager/Cashier only) | no | no |
| Edit another manager / the owner | manager: no; owner: manager yes, owner never | — | — |
| Edit or suspend self | no (role/suspend) | no | no |
| Open/close own shift | yes | yes | yes |
| Open shift for / close shift of someone else | yes (manage) | yes (manage) | no |
| See shifts | all | all | own only |

Employees are never deleted; "suspended" = `isActive = false`.

**Session revocation.** `getSession` now re-reads user `isActive`, `role`, `branchId` and the business's approval state from the database on every request, so suspension, demotion and branch moves take effect at once rather than after the 15-minute token lifetime. Tested: demoted manager loses stock-adjust at once; suspended cashier's existing session is refused and a new login fails; reactivation restores access. Cost: one extra indexed query per authenticated request (not measured).

**Decision recorded:** no manager-override or approval workflow was invented.

---

## G. Testing results

Commands (all run by CI; see `.github/workflows/ci.yml`):

```
npm ci
npm run typecheck                    # tsc --noEmit
npm run test:unit                    # 36 passed
bash scripts/apply-migrations.sh     # migrations 0–11, numeric order
npm run build
npm start &
npm run test:integration             # stock-sales 43, finance 22, employees 14, workflow 70 — 0 failed
```

Run 43607760343: all steps succeeded. Baseline run 43606686442 listed 19 failing defect checks plus 6 that passed for reasons noted in section B. Along the way the CI also caught a real type error in my shifts endpoint (fixed) and two arithmetic mistakes in my own new tests (wrong expected stock; void reason shorter than the 3-character minimum) — fixed in the tests, not in the application.

Not tested: UI behaviour in a browser; the offline sync engine against the new 403/404/409/idempotency responses; load/performance; real payment or email integrations.

---

## H. Backup and recovery evidence

See `docs/BACKUP_AND_RECOVERY.md`. Summary:
- Neon snapshot `snap-holy-morning-awzd8qs7` taken before any change.
- **Restoration performed:** snapshot restored into separate branch `restore-verify-phase-a` (`br-divine-hat-aw3fjl6w`); production stayed primary. Compared with production: 55/55 tables, identical row counts in every table (163 rows), 71/71 foreign keys, 5/5 CHECK constraints, 173/173 indexes, 0 orphans on both.
- **This is in-Neon recovery only.** No independent export exists (section I, item 1).

---

## I. Outstanding problems and decisions needed

1. **Off-platform backup (Blocked on owner).** Needs a storage location and a credential the owner controls for a scheduled encrypted `pg_dump`; nothing was stored in the repository. Free-plan point-in-time window is 6 hours.
2. **Production migration 11 and deployment** need the owner's explicit approval (section J).
3. **Vercel preview deployment of `phase-a` not yet tested.** Confirm which database the preview environment variables point to before opening one (stale preview env vars were noted earlier).
4. **UI for employee edit / suspend / role / branch and cashier shifts** not built.
5. **Decisions I took that you may want to change:** (D1) credit limit 0 = no credit allowed; (D2) cashiers sell only from their assigned branch (a cashier with no branch is unrestricted); (D3) whole-sale reversals only, no partial refunds; (D4) transfers have no idempotency key, so a retried transfer request would move stock twice.
6. **Unverified:** offline sync engine handling of the new responses; POS credit message text; screens beyond those listed under F-035; profit definition (accrual).
7. **F-034** server-side aggregation not done.
8. Migration folder naming (`10_` before `1_`) — recommended zero-padding follow-up.
9. Two disposable Neon branches exist: `restore-verify-phase-a` (`br-divine-hat-aw3fjl6w`) and `migration-test-phase-a-11` (`br-autumn-cell-awow39od`). **Deleting them needs your approval.**

---

## J. Production release instructions (nothing below has been run)

Releases are staged; stop and verify after each.

1. **Release 1 — CI/tests/docs only.** Merge to `main` has no runtime effect on its own except the Vercel build; confirm the build is green on a preview first.
2. **Preview test.** Open a preview deployment of `phase-a` pointed at a **disposable Neon branch** (not production), run the integration suite against it (`BASE=<preview url> DATABASE_URL=<branch url> npm run test:integration`).
3. **Snapshot production** (Neon snapshot, named with date and purpose).
4. **Pre-checks on production** (must both return 0):
   ```sql
   SELECT id FROM "InventoryLevel" WHERE quantity < 0;
   SELECT id FROM "CreditAccount" WHERE "amountPaid" < 0 OR "amountPaid" > "originalAmount";
   ```
5. **Apply migration 11 manually** (not via `prisma migrate deploy`): run the two `ALTER TABLE` statements in a transaction on production, confirm via `pg_constraint`. **Requires your explicit approval.**
6. **Deploy the code** (merge to `main`). The code and the constraints are independent: the code is correct without the constraints, the constraints only add a safety floor, so either order is safe, but applying the constraints first means a bug cannot write bad data.
7. **Smoke test on production:** one cash sale, one void, one stock adjustment with a test product in a test business; then remove nothing without asking.
8. **Rollback:** code — Vercel instant rollback to the previous deployment. Database — `ALTER TABLE … DROP CONSTRAINT` for the two constraint names (no data was changed by the migration). Full data recovery — restore the snapshot into a new branch and compare before any promotion.

---

## K. Release plan status (stages 1–5)

| Release | Content | Status |
|---|---|---|
| 1 | CI, lockfile, tests, docs | Done on branch; not merged |
| 2 | Stock integrity + migration 11 | Code and tests done; migration tested on disposable branch; not on production |
| 3 | Sales validation, credit, payments/refunds | Code and tests done; not deployed |
| 4 | Honest analytics UI | Code done; no browser test; not deployed |
| 5 | Employee/cashier permissions | API done and tested; no UI; not deployed |

---

## L. Readiness assessment

- **Ready for a preview deployment and owner review:** yes. 149 integration checks, 36 unit tests, typecheck and production build are green in CI.
- **Ready for production:** not yet. Needs, in order: owner approval of sections I and J, a preview test, a fresh snapshot and pre-checks, and ideally an off-platform backup first.
- **Risk if released as is:** low for data (production holds no retail data today and the migration is additive); the main residual risks are the untested UI changes and the unverified offline sync behaviour (sections G, I-6).
- **Not claimed:** that Insight is production-hardened; that backups are independent of Neon; that all audit findings are closed.
