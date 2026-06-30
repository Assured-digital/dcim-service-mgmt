-- Backfill: canonicalise legacy Task->Check links onto CheckItemFollowOn.
--
-- Historically createFollowOn wrote a "Check" parent pointer onto
-- Task.linkedEntityType/linkedEntityId in addition to the canonical CheckItemFollowOn row.
-- That scalar write has been removed; CheckItemFollowOn is now the sole source of truth for
-- the check->follow-on link. This guard ensures any pre-existing Task that carries the scalar
-- but is MISSING its canonical row gets one, so no check->task link is lost when those scalars
-- are eventually retired.
--
-- Idempotent: the NOT EXISTS guard makes a re-run a no-op. The scalar values are intentionally
-- left in place (a separate, scoped follow-up retires them). gen_random_uuid() is PG13+ core
-- (no pgcrypto extension). The check item is chosen deterministically -- a failed item if one
-- exists, else the lowest-ordered item -- because the scalar references the Check, not the
-- originating CheckItem.
INSERT INTO "CheckItemFollowOn" (id, "checkItemId", "entityType", "entityId", note, "createdById", "createdAt")
SELECT
  gen_random_uuid(),
  ci.id,
  'Task',
  t.id,
  'Backfilled from legacy linkedEntity scalar',
  NULL,
  now()
FROM "Task" t
JOIN LATERAL (
  SELECT id
  FROM "CheckItem"
  WHERE "checkId" = t."linkedEntityId"
  ORDER BY (response = 'FAIL') DESC NULLS LAST, "sortOrder" ASC
  LIMIT 1
) ci ON true
WHERE t."linkedEntityType" = 'Check'
  AND t."linkedEntityId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CheckItemFollowOn" f
    WHERE f."entityType" = 'Task' AND f."entityId" = t.id
  );
