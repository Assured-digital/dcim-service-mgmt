import { useMemo, useSyncExternalStore } from "react"
import { checkSync, type PendingPhotoView } from "./checkQueue"
import { useOnlineStatus } from "../useOnlineStatus"

// synced  — queue empty, everything is on the server
// syncing — actively replaying queued writes
// pending — queued, online, but not yet confirmed (e.g. server error / mid-retry)
// offline — queued and the device reports no connection
export type CheckSyncStatus = "synced" | "syncing" | "pending" | "offline"

export interface CheckExecutionSync {
  status: CheckSyncStatus
  pendingCount: number
  photosByItem: Record<string, PendingPhotoView[]>
  saveItemAnswer: (itemId: string, patch: { response?: string; notes?: string }) => Promise<void>
  queuePhoto: (itemId: string, file: File) => Promise<void>
}

const EMPTY_PHOTOS: Record<string, PendingPhotoView[]> = {}

// Ties the durable sync manager to one check id for the execution surface. Exposes the
// merged sync status + queued photos and durable write helpers; the page seeds its
// optimistic drafts from checkSync.loadAnswers() on mount (see CheckDetailPage).
export function useCheckExecutionSync(checkId: string | undefined): CheckExecutionSync {
  const snapshot = useSyncExternalStore(checkSync.subscribe, checkSync.getSnapshot)
  const online = useOnlineStatus()

  const pending = checkId ? snapshot.pendingByCheck[checkId] : undefined
  const pendingCount = pending?.count ?? 0
  const photosByItem = pending?.photosByItem ?? EMPTY_PHOTOS

  const status: CheckSyncStatus = useMemo(() => {
    if (pendingCount === 0) return "synced"
    if (snapshot.draining) return "syncing"
    return online ? "pending" : "offline"
  }, [snapshot.draining, pendingCount, online])

  return useMemo(
    () => ({
      status,
      pendingCount,
      photosByItem,
      saveItemAnswer: (itemId, patch) =>
        checkId ? checkSync.saveItemAnswer(checkId, itemId, patch) : Promise.resolve(),
      queuePhoto: (itemId, file) =>
        checkId ? checkSync.queuePhoto(checkId, itemId, file) : Promise.resolve(),
    }),
    [status, pendingCount, photosByItem, checkId],
  )
}
