import { useQueryClient } from "@tanstack/react-query"
import { getSelectedClientId } from "./scope"

type ClientLite = { id: string; name: string; lifecycleStage?: string }

// Resolve the currently-selected client (id + display name) for surfaces that
// need to echo it — e.g. the CreateRecordModal's client-first breadcrumb header.
// Reads the react-query cache the Shell already populates (["clients"] for
// org-super, ["clients-mine"] for client-scoped) rather than issuing another
// fetch; returns null if nothing is selected or the lists aren't cached yet
// (the header then degrades gracefully to just "New {type}").
export function useSelectedClient(): ClientLite | null {
  const qc = useQueryClient()
  const id = getSelectedClientId()
  if (!id) return null
  const lists = [
    qc.getQueryData<ClientLite[]>(["clients"]),
    qc.getQueryData<ClientLite[]>(["clients-mine"]),
  ]
  for (const list of lists) {
    const match = list?.find((c) => c.id === id)
    if (match) return match
  }
  return null
}
