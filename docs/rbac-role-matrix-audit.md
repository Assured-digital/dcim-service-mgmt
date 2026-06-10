# RBAC Role Matrix Audit (API vs UI)

Date: 2026-06-10 (reconciled against current controllers, `auth/role-scope.ts`, `auth/request-context.ts`, and `apps/web/src/routes/App.tsx`)

## Roles
- `ORG_OWNER` — organisation super-role
- `ORG_ADMIN` — organisation super-role
- `ADMIN` — **legacy** super-role (still org-super for back-compat; never offer for new users)
- `SERVICE_MANAGER`
- `SERVICE_DESK_ANALYST`
- `ENGINEER`
- `CLIENT_VIEWER`
- `PUBLIC_USER` — unauthenticated/portal submitter; never surfaced in staff UI

`ORG_SUPER_ROLES = [ORG_OWNER, ORG_ADMIN, ADMIN]` (`apps/api/src/auth/role-scope.ts`,
mirrored in `apps/web/src/lib/rbac.ts`).

## Audit Summary
- API role gating (`@Roles` on controllers) and UI route guards (`RequireRoles` in `App.tsx`) are
  aligned for the modules below.
- Read endpoints generally admit `CLIENT_VIEWER`; create/update/status endpoints exclude it.
- Operational module *routes* are visible to all authenticated roles; write actions are role-filtered
  in the UI. Only Overview, Audit, Clients, and Users are route-gated.
- User management (list/create/update) is restricted to org-super roles. `SERVICE_MANAGER` does **not**
  have Users CRUD access — it may only be an *actor* in assignment flows it is separately authorised for
  (see Tenant Scope Notes).

## Matrix
| Module | API Allowed Roles | UI Route Visible Roles | Notes |
|---|---|---|---|
| Dashboard / My Work | authenticated users | all authenticated roles | summary widgets only |
| Overview | org-super, SERVICE_MANAGER | org-super, SERVICE_MANAGER | route-gated (`App.tsx`) |
| Triage | queue/convert/status: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST | surfaced within Service Desk (all authenticated); legacy `/triage` redirects to `/service-desk` | actions role-filtered |
| Service Requests | list/get/export: + CLIENT_VIEWER; create/close: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST; status: + ENGINEER | all authenticated roles | write actions hidden for unauthorized users |
| Incidents | list/get/export: + CLIENT_VIEWER; create/assign/status: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER | all authenticated roles | write actions hidden for unauthorized users |
| Tasks | list/get/export: + CLIENT_VIEWER; create/status: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER | all authenticated roles | write actions hidden for unauthorized users |
| Assets | list/get/site-list: + CLIENT_VIEWER; create/update/delete: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER; export/import: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST | all authenticated roles | write actions hidden for unauthorized users |
| Checks | check list/get: + CLIENT_VIEWER; create/approve: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST; start/items: + ENGINEER; templates read: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER; template write/delete: org-super, SERVICE_MANAGER | all authenticated roles | replaces the former "Surveys" module; execution actions role-filtered |
| Clients | org-super (list/get/create/update). `GET /clients/me` + `GET /clients/mine`: any authenticated user (own assignments only) | org-super | tenant onboarding/status; the `mine`/`me` lookups feed the client selector |
| Users | list/create/update: org-super. `GET /users/assignable`: org-super, SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER (minimal `{id, displayName, email}` picker projection) | org-super (`/users`, `/admin/users`) | `/users/assignable` is operational-callable; the CRUD endpoints are not |

## Tenant Scope Notes
Tenant isolation is resolved per request in `resolveClientScope` (`apps/api/src/auth/request-context.ts`).
The JWT carries `userId`, `email`, `role`, `organizationId` — **not** a `clientId` (the `User.clientId`
scalar was dropped; users relate to clients many-to-many via `UserClientAssignment`).

- **Org-super roles:** scope comes from the `x-client-id` header (the frontend client selector),
  validated against the caller's organisation. Missing header → `BadRequest`; cross-org client →
  `Forbidden`. They may switch among all clients in their org.
- **Client-scoped roles (SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER, CLIENT_VIEWER):** scope comes
  from their `UserClientAssignment` rows (`resolveAssignedClient`). A requested `x-client-id` must be in
  their assigned set, else `Forbidden("Not assigned to this client")`. A user with zero assignments →
  `Forbidden("No client assignments")`.
- **Two-state client selector (frontend):** always visible for any logged-in user; only the data source
  differs — org-super → `GET /clients` (all org clients); client-scoped → `GET /clients/mine` (only their
  assigned clients). The `x-client-id` interceptor injects the selection for any authed user.

### User-assignment authorization (who can assign/manage whom)
Enforced in `users.service.ts`:
- **Assignment gate (`assertActorMayAssignClients`):** org-super → any client in their org; client-scoped
  actor → only clients the actor is themselves assigned to.
- **Subset-management rule:** a client-scoped actor may manage a target user only if **all** the target's
  assigned clients are within the actor's own assigned set, and the target has ≥1 assignment. Targets with
  no assignments (e.g. org-level users) are rejected for client-scoped actors. Org-super manage anyone in
  their org.
- **Role-tier limits:** `ORG_OWNER` and `ORG_ADMIN` may manage organisation/client operational roles per
  their allow-lists; `SERVICE_MANAGER` may only manage `SERVICE_DESK_ANALYST`, `ENGINEER`, `CLIENT_VIEWER`.
