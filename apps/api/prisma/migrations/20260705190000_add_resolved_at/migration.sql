-- Add a true resolution timestamp to the work-items that lacked one (Change/Risk/Issue already
-- have actualEnd/closedAt). Used by the MTTR + SLA-compliance dashboard metrics. NULL = not
-- currently resolved (or resolution time unknowable — see backfill note below).
ALTER TABLE "ServiceRequest" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Incident"       ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Task"           ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Backfill from the audit trail, honestly: stamp resolvedAt for records that are CURRENTLY in a
-- resolved state, using the most recent transition INTO that resolved state from a non-resolved one
-- (the start of the current resolved streak — matching the live capture semantics in
-- resolved-status.ts). AuditEvent.data is jsonb with changes:[{field,from,to}] where from/to are
-- HUMANISED labels frozen at emit time. Records resolved before audit logging existed have no such
-- event and are intentionally left NULL — excluded from metrics rather than guessed.

UPDATE "ServiceRequest" t
SET "resolvedAt" = sub.ts
FROM (
  SELECT ae."entityId" AS id, MAX(ae."createdAt") AS ts
  FROM "AuditEvent" ae,
       LATERAL jsonb_array_elements(ae."data" -> 'changes') AS ch
  WHERE ae."entityType" = 'ServiceRequest'
    AND ch ->> 'field' = 'status'
    AND ch ->> 'to' IN ('Completed', 'Closed')
    AND ch ->> 'from' NOT IN ('Completed', 'Closed')
  GROUP BY ae."entityId"
) sub
WHERE t.id = sub.id
  AND t.status IN ('COMPLETED', 'CLOSED');

UPDATE "Incident" t
SET "resolvedAt" = sub.ts
FROM (
  SELECT ae."entityId" AS id, MAX(ae."createdAt") AS ts
  FROM "AuditEvent" ae,
       LATERAL jsonb_array_elements(ae."data" -> 'changes') AS ch
  WHERE ae."entityType" = 'Incident'
    AND ch ->> 'field' = 'status'
    AND ch ->> 'to' IN ('Resolved', 'Closed')
    AND ch ->> 'from' NOT IN ('Resolved', 'Closed')
  GROUP BY ae."entityId"
) sub
WHERE t.id = sub.id
  AND t.status IN ('RESOLVED', 'CLOSED');

UPDATE "Task" t
SET "resolvedAt" = sub.ts
FROM (
  SELECT ae."entityId" AS id, MAX(ae."createdAt") AS ts
  FROM "AuditEvent" ae,
       LATERAL jsonb_array_elements(ae."data" -> 'changes') AS ch
  WHERE ae."entityType" = 'Task'
    AND ch ->> 'field' = 'status'
    AND ch ->> 'to' = 'Done'
    AND ch ->> 'from' <> 'Done'
  GROUP BY ae."entityId"
) sub
WHERE t.id = sub.id
  AND t.status = 'DONE';
