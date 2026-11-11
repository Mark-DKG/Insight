# Deploying Insight by 9DEVs

Production runs on **Vercel** (built from `main` on GitHub) with a **Neon PostgreSQL** database.
Every push to `main` builds and, if the build passes, replaces the live deployment.
A failed build never replaces the live site.

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection string (`?sslmode=require`). |
| `JWT_SIGNING_SECRET` | Long random string, e.g. `openssl rand -base64 48`. Rotating it signs everyone out. |
| `PLATFORM_ADMIN_SECRET` | Admin console secret, at least 32 random characters. Rotating it forces administrators to re-enrol MFA. |

Never commit real values. `.env.example` lists the names only.

## Build

`npm run build` runs `prisma generate && next build`. Generating the client on every build
prevents Vercel's dependency cache from serving a Prisma client older than the schema.

## Database migrations

Migrations live in `prisma/migrations/` and are committed:

| Migration | Change |
|---|---|
| `0_init` | Baseline schema (all core tables). |
| `1_auth_attempts` | `AuthAttempt` table. |
| `2_settings_receipts_resets` | `Business.receiptCounter`, `Business.settings`, `PasswordResetToken`. |
| `3_app_mode` | `AppMode` enum and `Business.appMode` (default `FULL`). |
| `4_platform_admin` | `PlatformAdmin`, `PlatformAdminSession`, append-only `PlatformAuditLog` (DB trigger), `Business.status`. |

All five are recorded as applied on the production database. Migrations are additive and
non-destructive.

**Applying a new migration to production** (from a machine with `DATABASE_URL` pointing at production):

```bash
npx prisma migrate deploy   # applies only migrations not yet recorded; never drops data
```

**Never** run `prisma migrate dev`, `prisma migrate reset` or `prisma db push` against production:
`dev`/`reset` can drop and recreate the database. Use them only against a local or branch database.

`0_init`–`2` were reconstructed from the live database after they were applied, so their
checksums differ from what `_prisma_migrations` recorded. `migrate deploy` does not re-check applied
migrations, so this is harmless in production; on a fresh local database run `npx prisma migrate deploy`
to build the schema from scratch.

## Local development

```bash
cp .env.example .env          # fill in a local/branch DATABASE_URL and a JWT secret
npm install                   # also runs prisma generate
npx prisma migrate deploy     # create the schema
npm run prisma:seed           # optional demo data — never run against production
npm run dev
```

## First use in production

1. Open `/register` and create the business owner account.
2. Owners invite staff from **Settings → Users & Roles**.
3. Choose **Settings → Application Mode** (Full Functionality or Inventory Only).
4. Turn off Vercel Authentication (Settings → Deployment Protection) so customers can reach the site.

## Platform admin console (`/admin`)

### Creating the first Super Admin

There is no sign-up page for administrators. The first Super Admin is created
from a machine with database access:

```bash
DATABASE_URL="<production connection string>" \
SUPER_ADMIN_EMAIL="you@example.com" SUPER_ADMIN_NAME="Your Name" \
npx tsx scripts/create-super-admin.ts
```

- It prints a temporary password once (or uses `SUPER_ADMIN_PASSWORD` if set, 12+ characters).
- It refuses to run if a Super Admin already exists. Later administrators are appointed inside the console (milestone 2).
- First sign-in at `/admin/login`: enrol an authenticator app (mandatory), then set a new password.

### Recovery (lost phone or password)

```bash
DATABASE_URL="<production connection string>" ADMIN_EMAIL="you@example.com" npx tsx scripts/reset-admin-access.ts
```

This prints a new temporary password, clears MFA so it must be re-enrolled, revokes the admin's
sessions and writes an audit record. It needs database credentials, so there is no web route that
could act as a backdoor.
