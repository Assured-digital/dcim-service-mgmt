-- Audit-event indexes (#95 / #64 index portion). Fully additive: three indexes on the
-- AuditEvent table, no data mutation, nothing else touched. Supports the forensic audit
-- grid's scoped+sorted default query, the entityType filter + per-record history lookup,
-- and the actor filter. Plain CREATE INDEX (no CONCURRENTLY — Prisma runs migrations in a
-- transaction; the table is young so a brief lock is fine).

-- CreateIndex
CREATE INDEX "AuditEvent_clientId_createdAt_idx" ON "AuditEvent"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_clientId_entityType_entityId_idx" ON "AuditEvent"("clientId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_clientId_actorUserId_idx" ON "AuditEvent"("clientId", "actorUserId");
