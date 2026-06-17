import { api } from "./api"

// Download the server-generated compliance/evidence PDF for a finalised (COMPLETED or
// CLOSED) check. Goes through the authed api client — the endpoint requires the JWT +
// x-client-id (auto-injected by the interceptor) and re-checks tenant scope on every
// embedded image byte, so a raw <a href> would be rejected (same reason attachments
// stream through the api). Callers only surface this for finalised checks; the backend
// still gates COMPLETED/CLOSED (400 otherwise). Throws on failure — caller shows the error.
export async function downloadCheckReport(checkId: string, reference: string): Promise<void> {
  const { data } = await api.get<Blob>(`/checks/${checkId}/report.pdf`, { responseType: "blob" })
  const url = window.URL.createObjectURL(data)
  const a = document.createElement("a")
  a.href = url
  a.download = `check-${reference}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
