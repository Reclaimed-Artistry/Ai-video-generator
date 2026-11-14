#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is required." >&2
  exit 1
fi

mkdir -p "${STORAGE_DIR:-/app/storage}"

echo "Syncing PostgreSQL schema via Drizzle..."
npx drizzle-kit push \
  --dialect=postgresql \
  --schema=./src/db/schema.ts \
  --url="$DATABASE_URL" \
  --force

echo "Starting Reclaimed Artistry production server on port ${PORT:-3000}..."
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
