-- Corrective: 20260415170500_add_connections_model created Connection_clientId_fkey
-- with ON DELETE CASCADE, but the schema declares no onDelete on a REQUIRED relation
-- — Prisma's default is ON DELETE RESTRICT (matching the sibling clientId FKs on
-- Site/Check/ServiceRequest). Consequence of the drift: cloud DBs (migrate deploy)
-- would cascade-delete a client's Connections while local (db push) blocks the
-- delete. Recreate the FK with the schema-correct actions so migration replay ==
-- schema exactly. Safe on live data: drop+add of a constraint with the same name,
-- revalidates existing rows (all already FK-valid), no rows touched.

-- DropForeignKey
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_clientId_fkey";

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
