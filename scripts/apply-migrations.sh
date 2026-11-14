#!/usr/bin/env bash
# Applies prisma/migrations/*/migration.sql in NUMERIC order to $DATABASE_URL.
#
# Why not `prisma migrate deploy`? Prisma orders migration folders as strings,
# so "10_store_reviews" runs before "1_auth_attempts" and fails on a fresh
# database; production was also migrated by hand, so its _prisma_migrations
# table only lists 0-5. This script mirrors the manual, ordered procedure.
# Use ONLY on a disposable database (CI, local, a Neon test branch).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
cd "$(dirname "$0")/.."
for d in $(ls prisma/migrations | grep -v '\.toml$' | sort -n); do
  echo "applying $d"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "prisma/migrations/$d/migration.sql"
done
