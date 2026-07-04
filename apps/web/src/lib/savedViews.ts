import { getSelectedClientId } from "./scope"
import { FilterSnapshot } from "../routes/assetRegisterFilters"

// Saved register views — a named search+filter combination. Persisted in
// localStorage, scoped per client so views don't bleed across client selection.
// (Deliberately client-side/per-browser for now; promote to a per-user server
// model if cross-device sync is wanted.)
export type SavedView = { id: string; name: string; filters: FilterSnapshot }

const KEY_PREFIX = "dcms_register_views:"

function keyFor(): string {
  return KEY_PREFIX + (getSelectedClientId() ?? "none")
}

export function listSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(keyFor())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function write(views: SavedView[]): SavedView[] {
  localStorage.setItem(keyFor(), JSON.stringify(views))
  return views
}

// Uses crypto.randomUUID (avoids Date.now/Math.random and available in the
// browser); name collisions overwrite the existing view of that name.
export function saveView(name: string, filters: FilterSnapshot): SavedView[] {
  const trimmed = name.trim()
  const views = listSavedViews().filter(v => v.name.toLowerCase() !== trimmed.toLowerCase())
  return write([...views, { id: crypto.randomUUID(), name: trimmed, filters }]
    .sort((a, b) => a.name.localeCompare(b.name)))
}

export function deleteView(id: string): SavedView[] {
  return write(listSavedViews().filter(v => v.id !== id))
}
