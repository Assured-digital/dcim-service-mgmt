#!/bin/sh
set -e

echo "Ensuring Prisma client is generated..."
npx prisma generate

echo "Syncing schema to DB (MVP: db push)..."
npx prisma db push

echo "Seeding (idempotent)..."
npx ts-node prisma/seed.ts

echo "Starting API (dev mode)..."
npm run start:dev
