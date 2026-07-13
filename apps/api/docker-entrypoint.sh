#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Environment-aware entrypoint.
#
# Behaviour is controlled by APP_ENV (defaults to "local"):
#
#   APP_ENV=local  (default, what docker-compose uses)
#       - prisma db push        (fast local schema sync, no migration needed)
#       - seed                  (always, for a working local dataset)
#       - dev mode              (watch / hot reload)
#     => identical to the old MVP behaviour. Local workflow unchanged.
#
#   APP_ENV=production  (Azure / any real environment)
#       - NO db push            (schema is owned by `prisma migrate deploy`,
#                                run as a separate one-off job, never here -
#                                multiple replicas must not race the schema)
#       - seed ONLY if RUN_SEED=true  (test may set this; prod never)
#       - compiled build        (node dist, not ts-node/watch)
#
# This keeps `docker compose up` working exactly as before while making the
# same image safe to run on Azure.
# ---------------------------------------------------------------------------

APP_ENV="${APP_ENV:-local}"

echo "Entrypoint starting (APP_ENV=$APP_ENV)..."
echo "Ensuring Prisma client is generated..."
npx prisma generate

# Provisioning-job mode: run the SharePoint provisioner sweep and exit. Used ONLY
# by the isolated provisioning Container Apps Job (env JOB_MODE=provision) — never
# the API. Runs after generate (client ready), before any schema/seed/API steps,
# so it never touches the DB schema.
if [ "$JOB_MODE" = "provision" ]; then
    echo "JOB_MODE=provision -> running SharePoint provisioning sweep..."
    exec node dist/src/provision-cli.js
fi

if [ "$APP_ENV" = "production" ]; then
    echo "Production mode: schema managed by migrate deploy (run as a job), skipping db push."

    if [ "${RUN_SEED:-false}" = "true" ]; then
        echo "RUN_SEED=true -> seeding (must only ever be set in TEST, never prod)..."
        npx ts-node prisma/seed.ts
    else
        echo "RUN_SEED not true -> skipping seed."
    fi

    echo "Starting API (production build)..."
    if npm run 2>/dev/null | grep -q "  start:prod"; then
        exec npm run start:prod
    else
        exec node dist/src/main.js
    fi
else
    echo "Local mode: db push + seed + dev server (unchanged MVP behaviour)."
    echo "Syncing schema to DB (local: db push)..."
    npx prisma db push
    echo "Seeding (idempotent)..."
    npx ts-node prisma/seed.ts
    echo "Starting API (dev mode)..."
    exec npm run start:dev
fi