import type { QueryKey } from "@tanstack/react-query"

// ─────────────────────────────────────────────────────────────────────────────
// recordTypeConfig — the per-type data that drives the ONE shared CreateRecord-
// Modal (Create Surface spec §2). The modal shell is universal; only this config
// varies per record type: the Details fields, the create endpoint + payload, the
// starting nav route, and cache invalidation. Migrate one type at a time — Task
// first (live), the other seven fold in behind the same shell.
//
// A field descriptor is a declarative spec the modal renders via the shared field
// kit (EnumSelect / DateField / AssigneePicker / FormTextField), so no per-type
// JSX. `span: "full"` makes a field span both FormGrid columns.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldDescriptor =
  | {
      kind: "enum"
      key: string
      label: string
      options: { value: string; label: string }[]
      required?: boolean
      span?: "full"
    }
  | { kind: "assignee"; key: string; label?: string; span?: "full" }
  | { kind: "date"; key: string; label: string; datetime?: boolean; span?: "full" }
  | {
      kind: "text"
      key: string
      label: string
      multiline?: boolean
      rows?: number
      required?: boolean
      span?: "full"
    }

// Context handed to buildPayload: the always-present title/description plus any
// generic parent context the modal was opened with (linkedEntity* scalars).
export interface CreatePayloadContext {
  title: string
  description: string
  linkedEntityType?: string
  linkedEntityId?: string
}

export interface RecordTypeConfig {
  label: string // "Task" — used in header + submit button
  titlePlaceholder: string
  hasDescription: boolean
  // When true the Description is required — an empty one surfaces an inline error
  // (same treatment as the title). Incident/Change/SR require a description.
  requireDescription?: boolean
  fields: FieldDescriptor[]
  defaults: Record<string, string>
  endpoint: string
  // Route to the new record's detail page (create-then-navigate). Omit for types
  // that stay on the current page after create.
  route?: (id: string) => string
  invalidateKeys: QueryKey[]
  successMessage: string
  // eslint-disable-next-line no-unused-vars
  buildPayload: (values: Record<string, string>, ctx: CreatePayloadContext) => Record<string, unknown>
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
]

const CHANGE_TYPE_OPTIONS = [
  { value: "STANDARD", label: "Standard" },
  { value: "NORMAL", label: "Normal" },
  { value: "EMERGENCY", label: "Emergency" },
]

function trimmedOrUndefined(v: string) {
  return v.trim() || undefined
}

// ── Task ─────────────────────────────────────────────────────────────────────
const task: RecordTypeConfig = {
  label: "Task",
  titlePlaceholder: "What needs doing?",
  hasDescription: true,
  fields: [
    { kind: "enum", key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
    { kind: "date", key: "dueAt", label: "Due date" },
    { kind: "assignee", key: "assigneeId", label: "Assignee", span: "full" },
  ],
  defaults: { priority: "medium", dueAt: "", assigneeId: "" },
  endpoint: "/tasks",
  route: (id) => `/service-desk/task/${id}`,
  invalidateKeys: [["tickets"], ["tasks"]],
  successMessage: "Task created",
  buildPayload: (v, ctx) => ({
    title: ctx.title.trim(),
    description: trimmedOrUndefined(ctx.description),
    priority: v.priority,
    dueAt: v.dueAt || undefined,
    assigneeId: v.assigneeId || undefined,
    linkedEntityType: ctx.linkedEntityType || undefined,
    linkedEntityId: ctx.linkedEntityId || undefined,
  }),
}

// ── Incident ─────────────────────────────────────────────────────────────────
const incident: RecordTypeConfig = {
  label: "Incident",
  titlePlaceholder: "What's the incident?",
  hasDescription: true,
  requireDescription: true,
  fields: [
    { kind: "enum", key: "severity", label: "Severity", options: SEVERITY_OPTIONS },
    { kind: "enum", key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
    { kind: "assignee", key: "assigneeId", label: "Assignee", span: "full" },
  ],
  defaults: { severity: "MEDIUM", priority: "medium", assigneeId: "" },
  endpoint: "/incidents",
  route: (id) => `/service-desk/inc/${id}`,
  invalidateKeys: [["tickets"]],
  successMessage: "Incident logged",
  buildPayload: (v, ctx) => ({
    title: ctx.title.trim(),
    description: ctx.description.trim(),
    severity: v.severity,
    priority: v.priority,
    assigneeId: v.assigneeId || undefined,
  }),
}

// ── Change ───────────────────────────────────────────────────────────────────
const change: RecordTypeConfig = {
  label: "Change",
  titlePlaceholder: "What's changing?",
  hasDescription: true,
  requireDescription: true,
  fields: [
    { kind: "enum", key: "changeType", label: "Change type", options: CHANGE_TYPE_OPTIONS },
    { kind: "enum", key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
    { kind: "assignee", key: "assigneeId", label: "Assignee" },
    { kind: "date", key: "scheduledStart", label: "Scheduled start", datetime: true },
    { kind: "date", key: "scheduledEnd", label: "Scheduled end", datetime: true },
    { kind: "text", key: "reason", label: "Reason", multiline: true, rows: 2, span: "full" },
    { kind: "text", key: "impactAssessment", label: "Impact assessment", multiline: true, rows: 2, span: "full" },
    { kind: "text", key: "rollbackPlan", label: "Rollback plan", multiline: true, rows: 2, span: "full" },
  ],
  defaults: {
    changeType: "NORMAL", priority: "medium", assigneeId: "",
    scheduledStart: "", scheduledEnd: "", reason: "", impactAssessment: "", rollbackPlan: "",
  },
  endpoint: "/changes",
  route: (id) => `/service-desk/chg/${id}`,
  invalidateKeys: [["tickets"]],
  successMessage: "Change logged",
  buildPayload: (v, ctx) => ({
    title: ctx.title.trim(),
    description: ctx.description.trim(),
    changeType: v.changeType,
    priority: v.priority,
    reason: trimmedOrUndefined(v.reason),
    impactAssessment: trimmedOrUndefined(v.impactAssessment),
    rollbackPlan: trimmedOrUndefined(v.rollbackPlan),
    scheduledStart: v.scheduledStart || undefined,
    scheduledEnd: v.scheduledEnd || undefined,
    assigneeId: v.assigneeId || undefined,
  }),
}

// Registry. Add service_request/risk/issue/maintenance/check here as each type
// migrates onto the shared surface (spec §2 / §4).
export const RECORD_TYPE_CONFIG: Record<string, RecordTypeConfig> = {
  task,
  incident,
  change,
}

export type CreatableRecordType = keyof typeof RECORD_TYPE_CONFIG
