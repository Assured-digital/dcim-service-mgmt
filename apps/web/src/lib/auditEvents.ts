// Shared audit-event type (read response from /audit-events/entity/:type/:id) + a pure humaniser.
// ONE source of truth for turning an AuditEvent into compact, content-free history lines, consumed by
// the History tab on every detail page AND the EntityHistoryDialog. Pure (no React) so it stays testable.
//
// Handles the 1a `data` shape ({ changes:[{field,label,from,to}], comment?, reference?, title? }),
// content-free COMMENTED/REPLIED, AND legacy prod events ({ fields:[...] } / { from, to } / null data) —
// it must NEVER render blank or throw on old data (prod has plenty).

export type FieldChange = { field: string; label: string; from: string | null; to: string | null }

export type AuditEvent = {
  id: string
  entityType?: string
  entityId?: string
  action: string
  actorUserId: string | null
  actorDisplayName?: string | null
  data?: Record<string, unknown> | null
  createdAt: string
}

export type HumanisedAudit = {
  /** One or more compact change lines (one per field for multi-field UPDATEs). Usually length 1. */
  lines: string[]
  /** Status-transition comment shown deliberately (STATUS_UPDATED `comment`) — NOT a content-free body. */
  note?: string
}

// "Incident" -> "incident"; "ServiceRequest" -> "service request"; fallback "record".
function recordNoun(entityType?: string, override?: string): string {
  if (override) return override
  if (!entityType) return "record"
  return entityType.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
}

// Legacy raw enum (e.g. "INVESTIGATING", "IN_PROGRESS") -> "Investigating" / "In progress".
function prettyEnum(v: string | null): string {
  if (!v) return "—"
  const s = v.replace(/_/g, " ").toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const dash = (v: string | null | undefined): string => (v != null && v !== "" ? v : "—")

function readChanges(data?: Record<string, unknown> | null): FieldChange[] {
  const c = data?.["changes"]
  return Array.isArray(c) ? (c as FieldChange[]) : []
}

function readStr(data: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = data?.[key]
  return typeof v === "string" && v.length > 0 ? v : null
}

export function humaniseAuditEvent(
  event: AuditEvent,
  opts?: { recordNoun?: string },
): HumanisedAudit {
  const data = event.data
  const noun = recordNoun(event.entityType, opts?.recordNoun)
  const changes = readChanges(data)
  const changeLines = changes.map((c) => `changed ${c.label}: ${dash(c.from)} → ${dash(c.to)}`)

  switch (event.action) {
    case "CREATED":
      return { lines: [`created this ${noun}`] }

    case "STATUS_UPDATED": {
      const note = readStr(data, "comment") ?? undefined
      if (changeLines.length) return { lines: changeLines, note } // new shape
      // legacy { from, to } (raw enum values)
      const from = readStr(data, "from")
      const to = readStr(data, "to")
      if (from || to) return { lines: [`changed Status: ${prettyEnum(from)} → ${prettyEnum(to)}`], note }
      return { lines: ["changed status"], note }
    }

    case "UPDATED":
      if (changeLines.length) return { lines: changeLines } // new shape
      return { lines: [`updated this ${noun}`] } // legacy { fields } / no data

    case "COMMENTED":
      return { lines: ["added a work note"] }

    case "REPLIED":
      return { lines: ["replied"] }

    default:
      // Unknown/other actions (DELETED, CLOSED, APPROVAL_RECORDED, …) — degrade gracefully.
      if (changeLines.length) return { lines: changeLines }
      return { lines: [`updated this ${noun}`] }
  }
}
