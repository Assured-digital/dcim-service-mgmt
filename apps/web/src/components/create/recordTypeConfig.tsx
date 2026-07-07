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

// Registry. Add incident/change/service_request/risk/issue/maintenance/check here
// as each type migrates onto the shared surface (spec §2 / §4).
export const RECORD_TYPE_CONFIG: Record<string, RecordTypeConfig> = {
  task,
}

export type CreatableRecordType = keyof typeof RECORD_TYPE_CONFIG
