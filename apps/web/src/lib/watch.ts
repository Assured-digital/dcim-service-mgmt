import { api } from "./api"

// ── Watch feature (Phase 2b) ────────────────────────────────────────────────
// A user opts into a record's activity notifications (STATUS_CHANGED + new comments)
// without being assigned. Jira-style: a single on/off toggle per record; WHICH events
// and channels are controlled globally in personal notification settings.
// Backend: apps/api/src/record-watch. recordType is PascalCase (matches the notification
// sourceType vocabulary) — the six work-item types only.

export type WatchRecordType =
  | "Incident"
  | "ServiceRequest"
  | "ChangeRequest"
  | "Task"
  | "Risk"
  | "Issue"

export async function fetchWatchStatus(
  recordType: WatchRecordType,
  recordId: string
): Promise<boolean> {
  const { data } = await api.get<{ watching: boolean }>("/watch", {
    params: { recordType, recordId },
  })
  return data.watching
}

export async function setWatch(
  recordType: WatchRecordType,
  recordId: string,
  watching: boolean
): Promise<boolean> {
  if (watching) {
    const { data } = await api.post<{ watching: boolean }>("/watch", { recordType, recordId })
    return data.watching
  }
  const { data } = await api.delete<{ watching: boolean }>("/watch", {
    params: { recordType, recordId },
  })
  return data.watching
}
