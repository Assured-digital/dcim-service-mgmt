import { api } from "../api"
import { uploadAttachment } from "../attachments"
import { getDB, type CheckStateRecord, type QueuedMutation, type StoredAnswer } from "./db"

// ── Field-work sync manager (singleton) ───────────────────────────────────────
// Durable IndexedDB is the source of truth; this manager keeps a small in-memory
// mirror so React can render pending counts + photo thumbnails reactively via
// useSyncExternalStore. Writes go to IDB first (optimistic), then a drain replays
// them through the EXISTING api calls. Online, the drain runs immediately ⇒ behaviour
// is identical to before, with a durable hop underneath. Offline, writes stay queued
// and replay on the `online` event. The manager wraps the existing API — never
// replaces it.

export interface PendingPhotoView {
  seq: number
  itemId: string
  url: string // object URL for the captured blob (revoked when the entry leaves the queue)
  filename: string
}

export interface CheckPending {
  count: number // queued mutations for this check (items + photos)
  photosByItem: Record<string, PendingPhotoView[]>
}

export interface SyncSnapshot {
  draining: boolean
  pendingByCheck: Record<string, CheckPending>
}

const EMPTY_PENDING: CheckPending = { count: 0, photosByItem: {} }

// The api response interceptor normalises errors to { statusCode }. A network/offline
// failure has no response ⇒ statusCode 0. Treat 0 and 5xx as transient (keep queued,
// retry later); 4xx is permanent (dead-letter so it can't wedge the queue).
function isTransient(err: unknown): boolean {
  const code = (err as { statusCode?: number } | undefined)?.statusCode ?? 0
  return code === 0 || code >= 500
}

class CheckSyncManager {
  private listeners = new Set<() => void>()
  private snapshot: SyncSnapshot = { draining: false, pendingByCheck: {} }
  private photoUrls = new Map<number, string>() // seq -> object URL (lifecycle owner)
  private draining = false
  private initPromise: Promise<void> | null = null

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => void this.drain())
    }
    void this.init()
  }

  // Build the in-memory mirror from the durable queue (object URLs for any photos left
  // over from a previous session) and flush whatever is pending.
  private init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.rebuildSnapshot()
        void this.drain()
      })()
    }
    return this.initPromise
  }

  // ── Subscription (useSyncExternalStore) ────────────────────────────────────
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  getSnapshot = (): SyncSnapshot => this.snapshot
  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  getCheckPending(checkId: string): CheckPending {
    return this.snapshot.pendingByCheck[checkId] ?? EMPTY_PENDING
  }

  // ── Reads ──────────────────────────────────────────────────────────────────
  async loadAnswers(checkId: string): Promise<Record<string, StoredAnswer>> {
    const db = await getDB()
    const rec = await db.get("checkState", checkId)
    return rec?.answers ?? {}
  }

  async loadCachedDoc(checkId: string): Promise<unknown | null> {
    const db = await getDB()
    const rec = await db.get("checkState", checkId)
    return rec?.checkDoc ?? null
  }

  async cacheDoc(checkId: string, doc: unknown): Promise<void> {
    const db = await getDB()
    const prev = await db.get("checkState", checkId)
    await db.put("checkState", {
      checkId,
      answers: prev?.answers ?? {},
      checkDoc: doc,
      updatedAt: Date.now(),
    })
  }

  // ── Writes ─────────────────────────────────────────────────────────────────
  // Optimistic answer write: persist to checkState (for restore/merge) AND upsert a
  // coalesced item mutation (for sync), then drain.
  async saveItemAnswer(
    checkId: string,
    itemId: string,
    patch: { response?: string; notes?: string },
  ): Promise<void> {
    const db = await getDB()
    const prev = await db.get("checkState", checkId)
    const prevAnswer = prev?.answers[itemId]
    const merged: StoredAnswer = {
      response: patch.response ?? prevAnswer?.response ?? "",
      notes: patch.notes ?? prevAnswer?.notes ?? "",
      updatedAt: Date.now(),
    }
    const state: CheckStateRecord = {
      checkId,
      answers: { ...(prev?.answers ?? {}), [itemId]: merged },
      checkDoc: prev?.checkDoc ?? null,
      updatedAt: Date.now(),
    }
    await db.put("checkState", state)

    // Coalesce: keep ≤1 pending item mutation per itemId (last write wins).
    const payload = { response: merged.response || undefined, notes: merged.notes || undefined }
    const existing = await this.findItemMutation(checkId, itemId)
    if (existing?.seq !== undefined) {
      await db.put("mutationQueue", { ...existing, payload, attempts: 0 })
    } else {
      await db.add("mutationQueue", {
        checkId,
        itemId,
        kind: "item",
        payload,
        createdAt: Date.now(),
        attempts: 0,
      })
    }
    await this.rebuildSnapshot()
    void this.drain()
  }

  async queuePhoto(checkId: string, itemId: string, file: File): Promise<void> {
    const db = await getDB()
    await db.add("mutationQueue", {
      checkId,
      itemId,
      kind: "photo",
      blob: file,
      filename: file.name || "photo.jpg",
      createdAt: Date.now(),
      attempts: 0,
    })
    await this.rebuildSnapshot()
    void this.drain()
  }

  // Drop all local state + queued writes for a check (e.g. once submitted and no longer
  // being executed). Safe to call when the queue is already empty.
  async clearCheck(checkId: string): Promise<void> {
    const db = await getDB()
    await db.delete("checkState", checkId)
    const tx = db.transaction("mutationQueue", "readwrite")
    for await (const cursor of tx.store.index("by-check").iterate(checkId)) {
      await cursor.delete()
    }
    await tx.done
    await this.rebuildSnapshot()
  }

  private async findItemMutation(checkId: string, itemId: string): Promise<QueuedMutation | undefined> {
    const db = await getDB()
    const all = await db.getAllFromIndex("mutationQueue", "by-check", checkId)
    return all.find((m) => m.kind === "item" && m.itemId === itemId)
  }

  // ── Replay ─────────────────────────────────────────────────────────────────
  async drain(): Promise<void> {
    if (this.draining) return
    // Avoid pointless failed requests when the NIC reports offline — the hook still
    // shows "offline" from pendingCount + navigator.onLine, and the `online` event
    // re-triggers this drain.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return
    this.draining = true
    this.setDraining(true)
    try {
      const db = await getDB()
      const queue = await db.getAll("mutationQueue") // ascending key ⇒ FIFO
      for (const m of queue) {
        try {
          if (m.kind === "item") {
            await api.post(`/checks/${m.checkId}/items/${m.itemId}`, {
              response: m.payload?.response || undefined,
              notes: m.payload?.notes || undefined,
            })
          } else if (m.blob) {
            const file = new File([m.blob], m.filename ?? "photo.jpg", { type: m.blob.type })
            await uploadAttachment("check-item", m.itemId, file)
          }
          if (m.seq !== undefined) await db.delete("mutationQueue", m.seq)
        } catch (err) {
          if (isTransient(err)) {
            // Keep queued; bump attempts and stop. Retries on next write / `online`.
            if (m.seq !== undefined) await db.put("mutationQueue", { ...m, attempts: m.attempts + 1 })
            return
          }
          // Permanent (4xx): dead-letter so one bad write can't block everything behind it.
          console.warn("[field-work] dropping rejected mutation", m.kind, m.itemId, err)
          if (m.seq !== undefined) await db.delete("mutationQueue", m.seq)
        }
      }
    } finally {
      this.draining = false
      this.setDraining(false)
      await this.rebuildSnapshot()
    }
  }

  // ── Snapshot maintenance ───────────────────────────────────────────────────
  private setDraining(v: boolean) {
    this.snapshot = { ...this.snapshot, draining: v }
    this.emit()
  }

  // Rebuild the reactive mirror from the durable queue and reconcile photo object URLs
  // (create for new captures, revoke for entries that have left the queue).
  private async rebuildSnapshot(): Promise<void> {
    const db = await getDB()
    const all = await db.getAll("mutationQueue")
    const liveSeqs = new Set<number>()
    const pendingByCheck: Record<string, CheckPending> = {}

    for (const m of all) {
      const bucket = (pendingByCheck[m.checkId] ??= { count: 0, photosByItem: {} })
      bucket.count += 1
      if (m.kind === "photo" && m.seq !== undefined && m.blob) {
        liveSeqs.add(m.seq)
        let url = this.photoUrls.get(m.seq)
        if (!url) {
          url = URL.createObjectURL(m.blob)
          this.photoUrls.set(m.seq, url)
        }
        ;(bucket.photosByItem[m.itemId] ??= []).push({
          seq: m.seq,
          itemId: m.itemId,
          url,
          filename: m.filename ?? "photo.jpg",
        })
      }
    }

    for (const [seq, url] of this.photoUrls) {
      if (!liveSeqs.has(seq)) {
        URL.revokeObjectURL(url)
        this.photoUrls.delete(seq)
      }
    }

    this.snapshot = { draining: this.snapshot.draining, pendingByCheck }
    this.emit()
  }
}

export const checkSync = new CheckSyncManager()
