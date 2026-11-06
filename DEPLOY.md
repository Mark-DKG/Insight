# Deploying the Insight by 9DEVs demo

This is a real Next.js 14 (App Router) project — not a mockup — with a
Postgres/Prisma backend, working auth, and the full UI wired into page
routes. What follows gets it live in about 10 minutes.

## 1. What's in this build

- `app/` — page routes (`/login`, `/register`, `/dashboard`, `/pos`,
  `/inventory`, `/purchases`, `/customers`, `/expenses`, `/reports`,
  `/advanced`, `/settings`) and the API routes under `app/api/`
- `components/` — the screen UI, each a client component
- `lib/` — auth, RBAC, tenant scoping, Prisma client, offline sync engine
- `prisma/schema.prisma` (see the schema you already have) + `prisma/seed.ts`
  — realistic demo data for "Riverside Mart"
- `middleware.ts` — route protection

**Current state:** every screen is wired to the live `app/api/*` routes and
starts empty. Create an account at `/register`; that account becomes the
Owner of a new business. Optional demo data: `prisma/seed.ts`.

## 2. Get a Postgres database

Pick one (all have a free tier that's enough for a demo):

- **Neon** — neon.tech → New Project → copy the connection string
- **Supabase** — supabase.com → New Project → Settings → Database →
  connection string (use the "connection pooling" URI for serverless)
- **Vercel Postgres** — from your Vercel project → Storage → Create
  Database → Postgres

You need a URL shaped like:
`postgresql://user:password@host:5432/dbname?sslmode=require`

## 3. Configure environment variables

Copy `.env.example` to `.env` locally:

```bash
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — from step 2
- `JWT_SIGNING_SECRET` — generate one with `openssl rand -base64 48`

## 4. Install, migrate, seed (local check before deploying)

```bash
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Visit `http://localhost:3000` — it redirects to `/login`. Demo login:

```
owner@riversidemart.demo
Password123!
```

(printed at the end of the seed script, along with the other seeded users'
emails if you want to log in as a cashier or manager instead — same password)

## 5. Push to GitHub

```bash
git init
git add .
git commit -m "Insight by 9DEVs demo"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

## 6. Deploy to Vercel

1. vercel.com → Add New Project → import the GitHub repo
2. Framework preset: Next.js (auto-detected)
3. Add environment variables (same two as `.env`): `DATABASE_URL`,
   `JWT_SIGNING_SECRET`
4. Deploy

`postinstall` in `package.json` runs `prisma generate` automatically during
Vercel's build, so you don't need a manual step for that.

**Run the migration + seed against the production database** — Vercel
doesn't do this for you:

```bash
# with DATABASE_URL pointed at production in your local .env
npx prisma migrate deploy
npm run prisma:seed
```

Then open the deployed URL — same demo login as above.

## 7. If something doesn't build

- **"Can't reach database server"** — check the connection string has
  `?sslmode=require` for Neon/Supabase, and that you used the *pooled*
  connection string if your host distinguishes pooled vs. direct (Vercel's
  serverless functions need pooled).
- **Prisma Client not generated** — confirm `postinstall` ran; if a build
  cache is stale, redeploy with "Clear Build Cache" in Vercel.
- **Login fails after seeding** — reseeding re-runs `main()` and will
  error on duplicate unique emails/SKUs if run twice against the same
  database. Reset with `npx prisma migrate reset` (drops and reseeds) if
  you need a clean slate.
