// Shared date formatters — one copy, used across list/detail surfaces.
// `formatDate` = day-month-year; `formatDateTime` = same + 24h time.
export function formatDate(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function formatDateTime(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${date}, ${time}`
}
