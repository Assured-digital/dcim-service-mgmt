import { api } from "./api"

// Work packages = the engagement / contract / project record (CRM_DESIGN.md §3).
// `value` and `commercialNotes` are ABSENT for field roles (decision 12).
export type WorkPackageTask = {
  id: string
  reference: string
  title: string
  status: string
  priority: string
  dueAt: string | null
}

export type WorkPackageView = {
  id: string
  reference: string
  title: string
  type: string
  status: string
  description: string | null
  startDate: string | null
  endDate: string | null
  value?: number | null
  renewalDate: string | null
  noticePeriodDays: number | null
  autoRenews: boolean
  commercialNotes?: string | null
  sites?: Array<{ site: { id: string; name: string } }>
  tasks?: WorkPackageTask[]
  taskSummary?: { total: number; done: number; percentComplete: number | null }
  createdAt: string
  updatedAt: string
}

export const WP_TYPE_LABELS: Record<string, string> = {
  MANAGED_SERVICE: "Managed service",
  PROJECT: "Project",
  AUDIT: "Audit",
  ADVISORY: "Advisory",
  MIGRATION: "Migration",
  OTHER: "Other"
}

export const WP_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const
export const WP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
}

export type WorkPackagePatch = {
  title?: string
  type?: string
  status?: string
  description?: string
  startDate?: string
  endDate?: string
  value?: number
  renewalDate?: string
  noticePeriodDays?: number
  autoRenews?: boolean
  commercialNotes?: string
}

// Days until a renewal, or null when no renewalDate. Negative = overdue.
export function daysUntilRenewal(wp: Pick<WorkPackageView, "renewalDate">): number | null {
  if (!wp.renewalDate) return null
  return Math.ceil((new Date(wp.renewalDate).getTime() - Date.now()) / 86_400_000)
}

export async function listWorkPackages(filters?: { renewingBefore?: string }) {
  return (await api.get<WorkPackageView[]>("/work-packages", { params: filters })).data
}

export async function getWorkPackage(id: string) {
  return (await api.get<WorkPackageView>(`/work-packages/${id}`)).data
}

export async function updateWorkPackage(id: string, dto: WorkPackagePatch) {
  return (await api.patch<WorkPackageView>(`/work-packages/${id}`, dto)).data
}

// Create a task pre-linked to a work package via the generic parent-context
// pointer (linkedEntityType "work_package").
export async function createWorkPackageTask(workPackageId: string, dto: { title: string; description?: string; priority?: string; dueAt?: string; assigneeId?: string }) {
  return (await api.post("/tasks", { ...dto, linkedEntityType: "work_package", linkedEntityId: workPackageId })).data
}
