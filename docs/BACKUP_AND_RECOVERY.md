# Backup and recovery (Neon)

Status as of 14 Nov 2026. Evidence is recorded below; nothing here is a claim beyond it.

## What exists

| Mechanism | State |
|---|---|
| Neon plan | `free_v3`, project `small-rain-12281842`, branch `br-empty-sea-awp8x42e` (primary), database `insight`, Postgres 18, us-east-1 |
| Point-in-time history | `history_retention_seconds = 21600` (6 hours) |
| Automatic snapshot schedule | None configured (`get_snapshot_schedule` returned `[]`) |
| Manual snapshot | `snap-holy-morning-awzd8qs7` "phase-a-pre-change-2026-11-14", taken 2026-11-14 14:27 UTC from the primary branch |
| Off-platform export (`pg_dump`) | **Not established.** Needs protected storage and a credential the owner controls (see "Outstanding") |

## Procedure: take a snapshot (before any migration)

1. Neon console → Backup & Restore → Create snapshot on the primary branch, or the Neon MCP `create_snapshot` tool.
2. Name it with the date and purpose.

## Procedure: restore into a separate, disposable branch (never over production)

1. `restore_snapshot` with `finalize: false` and a new branch name. This creates a **new** branch; the primary is not touched.
2. Compare the restored branch to production with the queries below.
3. Delete the disposable branch when finished (owner approval).

Production is only ever replaced from a verified snapshot by an explicit, approved `finalize_branch_restore`.

## Restoration test performed 14 Nov 2026

Snapshot `snap-holy-morning-awzd8qs7` restored to branch `br-divine-hat-aw3fjl6w` ("restore-verify-phase-a"). Production remained the primary branch (verified with `list_branches`).

| Check (production vs restored) | Result |
|---|---|
| Tables in `public` | 55 vs 55 |
| Row counts, every table | identical (163 rows in total; e.g. User 5, Business 5, Branch 5, AuditLog 27, RefreshToken 22, StoreCategory 10) |
| Foreign keys | 71 vs 71 |
| CHECK constraints | 5 vs 5 |
| Indexes | 173 vs 173 |
| Orphan users / branches / refresh tokens | 0 / 0 / 0 on both |

Queries used (read-only):

```sql
select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text as n
from information_schema.tables where table_schema='public' and table_type='BASE TABLE';
```

**Conclusion:** restoring a snapshot into a separate branch works and reproduces the schema and all rows. This demonstrates *in-Neon* recovery only.

## Observation relevant to migrations

At the time of the snapshot production held **no** sales, products, inventory levels, customers, credit accounts, payments, purchases or shifts (all counts 0). Only 5 businesses/users/branches and store/email/admin records exist. Adding data constraints to the retail tables therefore cannot conflict with existing production rows today. This must be re-checked immediately before any production migration.

## Outstanding (needs the owner)

- The snapshot lives in the same Neon account as the database. An independent copy (a scheduled `pg_dump` stored encrypted in storage the owner controls, outside this repository) is **not** in place. Needs: a storage location and a credential supplied by the owner. Until then, recovery depends on Neon alone.
- On the free plan the point-in-time window is 6 hours. Take a snapshot before each production change; consider a paid plan or a snapshot schedule for longer retention.
- Never commit dumps or connection strings to the repository.
