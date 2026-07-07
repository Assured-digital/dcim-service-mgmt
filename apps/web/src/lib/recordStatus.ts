// Shared live/historical classification for records across the app. A record is
// "historical" once it reaches a terminal state (closed / resolved / done /
// cancelled / rejected / retired / implemented / archived); everything else is
// "live". Used to split record lists into a Live view and a separate History view
// so closed records stay accessible without cluttering the active work.
//
// This is a string-status heuristic (matches the domain status vocab across the
// six work-item types + DCIM lifecycle). It intentionally lives in one place so the
// definition of "historical" is consistent everywhere the split is applied.
// Terminal-state vocab drawn from every domain's status enums (work items, DCIM
// lifecycle, CRM quotes/clients/contacts, work packages). Each token appears ONLY
// in terminal statuses, so matching by substring is safe:
//   work items  → closed / resolved / done / complete(d) / cancelled / rejected
//   DCIM        → retired / decommission(ed)
//   quotes      → accepted / rejected / expired / withdrawn
//   clients     → inactive / former   ·   contacts/users → inactive
//   work pkgs   → completed / cancelled   ·   changes → implemented
const TERMINAL_STATUS =
  /(closed|resolved|done|complete|completed|cancelled|canceled|rejected|retired|implemented|archived|decommission|accepted|expired|withdrawn|inactive|former)/i

export function isHistoricalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_STATUS.test(status)
}

export function isLiveStatus(status: string | null | undefined): boolean {
  return !isHistoricalStatus(status)
}

// Partition any status-bearing rows into { live, historical } preserving order.
export function partitionByHistory<T>(
  rows: T[],
  getStatus: (row: T) => string | null | undefined
): { live: T[]; historical: T[] } {
  const live: T[] = []
  const historical: T[] = []
  for (const row of rows) {
    ;(isHistoricalStatus(getStatus(row)) ? historical : live).push(row)
  }
  return { live, historical }
}
