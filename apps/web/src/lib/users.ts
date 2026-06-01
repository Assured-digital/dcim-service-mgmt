import { api } from "./api"

// ── Role union ───────────────────────────────────────────────────────────
// Mirrors the @prisma/client Role enum; web pages reference roles as string
// unions via lib/rbac.ts ROLES rather than importing the prisma type, so we
// keep the same convention here.
export type UserRole =
  | "ORG_OWNER"
  | "ORG_ADMIN"
  | "ADMIN"
  | "SERVICE_MANAGER"
  | "SERVICE_DESK_ANALYST"
  | "ENGINEER"
  | "CLIENT_VIEWER"
  | "PUBLIC_USER"

// ── API shapes ──────────────────────────────────────────────────────────
// Matches UsersService.toView — the API never returns passwordHash.
export type UserView = {
  id: string
  email: string
  role: UserRole
  organizationId: string | null
  clientId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Mirrors CreateUserDto.
export type CreateUserInput = {
  email: string
  password: string
  role: UserRole
  clientId?: string
  isActive?: boolean
}

// Mirrors UpdateUserDto.
export type UpdateUserInput = {
  role?: UserRole
  clientId?: string
  isActive?: boolean
  password?: string
}

// ── Calls ─────────────────────────────────────────────────────────────────
// The x-client-id scope header is auto-attached by the api.ts request
// interceptor for org-super-role users — never set it manually here.
export async function listUsers() {
  return (await api.get<UserView[]>("/users")).data
}

export async function createUser(dto: CreateUserInput) {
  return (await api.post<UserView>("/users", dto)).data
}

export async function updateUser(id: string, dto: UpdateUserInput) {
  return (await api.patch<UserView>(`/users/${id}`, dto)).data
}
