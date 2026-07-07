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

// eslint-disable-next-line no-unused-vars
type ShowIf = (values: Record<string, string>) => boolean

export type FieldDescriptor =
  | {
      kind: "enum"
      key: string
      label: string
      options: { value: string; label: string }[]
      required?: boolean
      includeEmpty?: string
      span?: "full"
      showIf?: ShowIf
    }
  // Options fetched by the caller and passed to the modal via `asyncOptions[source]`
  // (e.g. Maintenance's Asset list, a Check's Templates/Sites).
  | {
      kind: "asyncEnum"
      key: string
      label: string
      source: string
      required?: boolean
      includeEmpty?: string
      span?: "full"
      showIf?: ShowIf
    }
  | { kind: "assignee"; key: string; label?: string; required?: boolean; emptyLabel?: string; span?: "full"; showIf?: ShowIf }
  | { kind: "date"; key: string; label: string; datetime?: boolean; required?: boolean; span?: "full"; showIf?: ShowIf }
  | {
      kind: "text"
      key: string
      label: string
      multiline?: boolean
      rows?: number
      required?: boolean
      span?: "full"
      showIf?: ShowIf
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
  // Whether this type has the always-present Title field. Default true; set false
  // for the non-title-centric types (Maintenance is asset-centric; a Check's title
  // comes from its template). When false the modal validates the required Details
  // fields instead of the title.
  hasTitle?: boolean
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

const RAG_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
]

const ISSUE_SEVERITY_OPTIONS = [
  { value: "RED", label: "Red — High" },
  { value: "AMBER", label: "Amber — Medium" },
  { value: "GREEN", label: "Green — Low" },
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

// ── Service Request ──────────────────────────────────────────────────────────
const service_request: RecordTypeConfig = {
  label: "Service request",
  titlePlaceholder: "What do you need?",
  hasDescription: true,
  requireDescription: true,
  fields: [
    { kind: "enum", key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
    { kind: "assignee", key: "assigneeId", label: "Assignee", span: "full" },
  ],
  defaults: { priority: "medium", assigneeId: "" },
  endpoint: "/service-requests",
  route: (id) => `/service-desk/sr/${id}`,
  invalidateKeys: [["tickets"]],
  successMessage: "Service request logged",
  buildPayload: (v, ctx) => ({
    subject: ctx.title.trim(),
    description: ctx.description.trim(),
    priority: v.priority,
    assigneeId: v.assigneeId || undefined,
    linkedEntityType: ctx.linkedEntityType || undefined,
    linkedEntityId: ctx.linkedEntityId || undefined,
  }),
}

// ── Risk ─────────────────────────────────────────────────────────────────────
const risk: RecordTypeConfig = {
  label: "Risk",
  titlePlaceholder: "What's the risk?",
  hasDescription: true,
  requireDescription: true,
  fields: [
    { kind: "enum", key: "likelihood", label: "Likelihood", options: RAG_OPTIONS },
    { kind: "enum", key: "impact", label: "Impact", options: RAG_OPTIONS },
    { kind: "assignee", key: "assigneeId", label: "Owner", span: "full" },
  ],
  defaults: { likelihood: "MEDIUM", impact: "MEDIUM", assigneeId: "" },
  endpoint: "/risks",
  route: (id) => `/service-desk/risk/${id}`,
  invalidateKeys: [["tickets"]],
  successMessage: "Risk logged",
  buildPayload: (v, ctx) => ({
    title: ctx.title.trim(),
    description: ctx.description.trim(),
    likelihood: v.likelihood,
    impact: v.impact,
    assigneeId: v.assigneeId || undefined,
    linkedEntityType: ctx.linkedEntityType || undefined,
    linkedEntityId: ctx.linkedEntityId || undefined,
  }),
}

// ── Issue ────────────────────────────────────────────────────────────────────
const issue: RecordTypeConfig = {
  label: "Issue",
  titlePlaceholder: "What's the issue?",
  hasDescription: true,
  requireDescription: true,
  fields: [
    { kind: "enum", key: "severity", label: "Severity", options: ISSUE_SEVERITY_OPTIONS },
    { kind: "assignee", key: "assigneeId", label: "Assignee", span: "full" },
  ],
  defaults: { severity: "AMBER", assigneeId: "" },
  endpoint: "/issues",
  route: (id) => `/service-desk/issue/${id}`,
  invalidateKeys: [["tickets"]],
  successMessage: "Issue logged",
  buildPayload: (v, ctx) => ({
    title: ctx.title.trim(),
    description: ctx.description.trim(),
    severity: v.severity,
    assigneeId: v.assigneeId || undefined,
    linkedEntityType: ctx.linkedEntityType || undefined,
    linkedEntityId: ctx.linkedEntityId || undefined,
  }),
}

const MAINTENANCE_WORK_TYPE_OPTIONS = [
  "INSPECTION", "PSU_REPLACEMENT", "FIRMWARE_UPGRADE", "PAT_INSPECTION",
  "COOLING_CHECK", "CABLE_AUDIT", "REPAIR", "UPGRADE", "OTHER",
].map((v) => ({ value: v, label: v.replaceAll("_", " ") }))

// ── Maintenance ──────────────────────────────────────────────────────────────
// No title (asset-centric). Asset options are fetched by the caller and passed in
// via asyncOptions.assets. "Performed by" empty = the current user.
const maintenance: RecordTypeConfig = {
  label: "Maintenance",
  titlePlaceholder: "",
  hasTitle: false,
  hasDescription: false,
  fields: [
    { kind: "asyncEnum", key: "assetId", label: "Asset", source: "assets", required: true, includeEmpty: "Select asset…", span: "full" },
    { kind: "enum", key: "workType", label: "Work type", options: MAINTENANCE_WORK_TYPE_OPTIONS, required: true },
    { kind: "text", key: "workTypeOther", label: "Custom work type", required: true, span: "full", showIf: (v) => v.workType === "OTHER" },
    { kind: "date", key: "performedAt", label: "Performed at", required: true },
    { kind: "date", key: "nextDueAt", label: "Next due" },
    { kind: "assignee", key: "performedById", label: "Performed by", emptyLabel: "Use current user", span: "full" },
    { kind: "text", key: "notes", label: "Notes", multiline: true, rows: 3, span: "full" },
  ],
  defaults: { assetId: "", workType: "INSPECTION", workTypeOther: "", performedAt: "", nextDueAt: "", performedById: "", notes: "" },
  endpoint: "/maintenance",
  route: (id) => `/maintenance/${id}`,
  invalidateKeys: [["maintenance"]],
  successMessage: "Maintenance logged",
  buildPayload: (v) => ({
    assetId: v.assetId,
    workType: v.workType,
    workTypeOther: v.workType === "OTHER" ? (v.workTypeOther.trim() || undefined) : undefined,
    performedAt: v.performedAt ? new Date(v.performedAt).toISOString() : undefined,
    nextDueAt: v.nextDueAt ? new Date(v.nextDueAt).toISOString() : undefined,
    performedById: v.performedById || undefined,
    notes: trimmedOrUndefined(v.notes),
  }),
}

// ── Check ────────────────────────────────────────────────────────────────────
// No title (comes from the template). Template + Site options fetched by the
// caller and passed via asyncOptions.templates / asyncOptions.sites.
const check: RecordTypeConfig = {
  label: "Check",
  titlePlaceholder: "",
  hasTitle: false,
  hasDescription: false,
  fields: [
    { kind: "asyncEnum", key: "templateId", label: "Template", source: "templates", required: true, includeEmpty: "Select a template…", span: "full" },
    { kind: "asyncEnum", key: "siteId", label: "Site", source: "sites", required: true, includeEmpty: "Select a site…", span: "full" },
    { kind: "assignee", key: "assigneeId", label: "Assign engineer (optional)", span: "full" },
    { kind: "date", key: "scheduledAt", label: "Scheduled date (optional)", span: "full" },
    { kind: "text", key: "scopeNotes", label: "Scope notes (optional)", multiline: true, rows: 2, span: "full" },
  ],
  defaults: { templateId: "", siteId: "", assigneeId: "", scheduledAt: "", scopeNotes: "" },
  endpoint: "/checks",
  route: (id) => `/checks/${id}`,
  invalidateKeys: [["checks"]],
  successMessage: "Check scheduled",
  buildPayload: (v) => ({
    templateId: v.templateId,
    siteId: v.siteId,
    assigneeId: v.assigneeId || undefined,
    scheduledAt: v.scheduledAt || undefined,
    scopeNotes: trimmedOrUndefined(v.scopeNotes),
  }),
}

// Registry — all eight governed record types now create through CreateRecordModal.
export const RECORD_TYPE_CONFIG: Record<string, RecordTypeConfig> = {
  task,
  incident,
  change,
  service_request,
  risk,
  issue,
  maintenance,
  check,
}

export type CreatableRecordType = keyof typeof RECORD_TYPE_CONFIG
