import { openDB, type DBSchema, type IDBPDatabase } from "idb"

// ── Durable field-work store (IndexedDB) ──────────────────────────────────────
// Backs Phase 4a light offline resilience for check execution: in-progress answers
// + a replay queue (item writes + photo blobs) survive disconnect/refresh and sync
// when back online. Keyed by check id. This is NOT a PWA / app-shell cache — the SPA
// itself must already be loaded (that's the 4b boundary); see the checkDoc note below.

export interface StoredAnswer {
  response: string
  notes: string
  updatedAt: number
}

// Per-check local state: the optimistic answers the engineer sees, plus the last-good
// server check document. checkDoc is cached so the page can still render if a reopen
// GET fails while the app shell happens to be available (graceful-degrade) — it is NOT
// a guarantee that a fully-cold offline reload works (that needs a service worker, 4b).
export interface CheckStateRecord {
  checkId: string
  answers: Record<string, StoredAnswer>
  checkDoc: unknown | null
  updatedAt: number
}

// One pending write awaiting replay. `kind:'item'` is coalesced (≤1 per itemId, last
// write wins — the server endpoint is an idempotent upsert). `kind:'photo'` is
// append-only (one per capture; the blob is replayed via uploadAttachment).
export interface QueuedMutation {
  seq?: number // auto-increment key (FIFO ordering); absent until written
  checkId: string
  itemId: string
  kind: "item" | "photo"
  payload?: { response?: string; notes?: string }
  blob?: Blob
  filename?: string
  uploadId?: string // reserved for future server-side dedup (4b); unused in 4a
  createdAt: number
  attempts: number
}

interface FieldWorkDB extends DBSchema {
  checkState: {
    key: string
    value: CheckStateRecord
  }
  mutationQueue: {
    key: number
    value: QueuedMutation
    indexes: { "by-check": string }
  }
}

let dbPromise: Promise<IDBPDatabase<FieldWorkDB>> | null = null

export function getDB(): Promise<IDBPDatabase<FieldWorkDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FieldWorkDB>("dcms-field-work", 1, {
      upgrade(db) {
        db.createObjectStore("checkState", { keyPath: "checkId" })
        const q = db.createObjectStore("mutationQueue", { keyPath: "seq", autoIncrement: true })
        q.createIndex("by-check", "checkId")
      },
    })
  }
  return dbPromise
}
