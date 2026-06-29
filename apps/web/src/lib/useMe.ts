import { useQuery } from "@tanstack/react-query"
import { api } from "./api"
import { getCurrentUser } from "./auth"

// The current user's profile fields the JWT-derived CurrentUser does NOT carry (it has only
// email/role). GET /auth/me is the single client-side source for the name.
export type MeProfile = {
  knownAs: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
}

// Shared fetch of GET /auth/me. The fixed queryKey means every caller (account menu, My Work
// greeting, …) dedupes to ONE network request via the react-query cache — add a caller, not
// a fetch. Pair with personName() to render the name (knownAs verbatim -> "First Last" -> email).
export function useMe() {
  return useQuery({
    queryKey: ["auth-me"],
    enabled: !!getCurrentUser(),
    queryFn: async () => (await api.get<MeProfile>("/auth/me")).data
  })
}
