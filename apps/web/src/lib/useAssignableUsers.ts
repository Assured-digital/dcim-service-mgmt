import { useQuery } from "@tanstack/react-query"
import { api } from "./api"

// Shape returned by GET /users/assignable — the assignable set for the current
// client scope. Callable by AD-staff operational roles (unlike admin-only
// GET /users), so assignee pickers no longer 403 for operational users.
export type AssignableUser = { id: string; displayName: string; email: string }

// Shared source of truth for assignee pickers. The x-client-id request
// interceptor scopes this to the current client automatically; the Shell's
// client-switch invalidation (everything except ["clients"]/["clients-mine"])
// invalidates ["users-assignable"] too, so it refetches on client switch.
export function useAssignableUsers() {
  return useQuery({
    queryKey: ["users-assignable"],
    queryFn: async () => (await api.get<AssignableUser[]>("/users/assignable")).data,
  })
}
