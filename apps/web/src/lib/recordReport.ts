import { api } from "./api"

// The six exportable work-item types — the on-the-wire contract with the backend
// (GET /records/:type/:id/report.pdf). Mirrors the server's RECORD_REPORT_TYPES.
export type ReportRecordType = "service_request" | "incident" | "change" | "risk" | "issue" | "task"

const FILE_PREFIX: Record<ReportRecordType, string> = {
  service_request: "service-request",
  incident: "incident",
  change: "change",
  risk: "risk",
  issue: "issue",
  task: "task",
}

// Download a record's server-rendered PDF. Goes through the authed api client — the endpoint
// requires the JWT + x-client-id (auto-injected by the interceptor) and re-checks tenant
// scope on every embedded image byte, so a raw <a href> would be rejected (same reason
// attachments and the check report stream through the api). Throws on failure — the caller
// surfaces the error.
export async function downloadRecordReport(
  type: ReportRecordType,
  id: string,
  reference: string
): Promise<void> {
  const { data } = await api.get<Blob>(`/records/${type}/${id}/report.pdf`, { responseType: "blob" })
  const url = window.URL.createObjectURL(data)
  const a = document.createElement("a")
  a.href = url
  a.download = `${FILE_PREFIX[type]}-${reference}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
