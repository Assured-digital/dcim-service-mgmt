// D2 — internal domain events (ADR-006, "no module owns another's data"). A service
// publishes a domain FACT; cross-cutting concerns subscribe and react — notifications
// today, webhooks / SLA escalation / cross-module reactions later — without the emitting
// service knowing they exist. In-process via @nestjs/event-emitter (modular-monolith
// choice; no distributed broker). Audit stays INLINE + reliable and is intentionally
// NOT routed through here (a dropped audit record is a compliance problem; a dropped
// notification is not).

export const RECORD_STATUS_CHANGED = "record.status_changed"
export const RECORD_ASSIGNED = "record.assigned"

// Shared payload for a work-item lifecycle event. recordType is the PascalCase model
// name (matches Notification.sourceType + the watch recordType); assigneeId is the
// record's assignee at event time (the notification recipient).
export interface RecordLifecyclePayload {
  recordType: string
  recordId: string
  clientId: string
  actorId: string | null
  assigneeId: string | null
}
