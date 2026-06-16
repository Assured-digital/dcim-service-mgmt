import { useSyncExternalStore } from "react"

// Reactive navigator.onLine. NB: onLine reflects only the NIC, not real reachability —
// the sync manager additionally treats a failed write as transient, so this hook is for
// display/affordance, not the sole source of truth.
function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb)
  window.addEventListener("offline", cb)
  return () => {
    window.removeEventListener("online", cb)
    window.removeEventListener("offline", cb)
  }
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // assume online before hydration
  )
}
