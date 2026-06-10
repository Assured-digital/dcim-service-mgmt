> **HISTORICAL RECORD — SUPERSEDED.**
> This file is a frozen, provenance-only record of the original
> organization-hierarchy / early multi-client design phases. It is **superseded by
> [docs/MULTI_CLIENT_ASSIGNMENT_DESIGN.md](MULTI_CLIENT_ASSIGNMENT_DESIGN.md)**, which
> is the current source of truth for the multi-client architecture.
>
> The phase content below is preserved **as originally written** — including decisions
> that were later changed or reversed (e.g. the admin-default-`clientId` model and the
> admin-only/top-bar client selector). Do **not** read it as a description of current
> behaviour. It records what was decided at each phase, not what is true today.

---

## Phase 1 — Organization model + boundaries

Date: 2026-03-05

### What this phase delivers
- Introduces `Organization` model.
- Associates `Client` and `User` with `organizationId`.
- Keeps existing client-level operational roles unchanged.
- Treats `ADMIN` as organization-level super user.
- Enforces organization boundaries for Clients and Users management APIs.

### Super user behavior
- `ADMIN` can create/manage multiple clients in their organization.
- `ADMIN` can create/manage users across clients in their organization.
- Cross-organization client/user management is blocked.

### Backward-compatible rollout
- Seed script backfills users/clients missing organization into a default organization.
- Existing admin keeps a default `clientId` to avoid breaking client-scoped module pages.
- JWT/session now include `organizationId`.

### Known limitation (next phase)
- Operational modules (SR/Assets/Incidents/Tasks/Surveys) still rely on client scope resolution and are not fully org-aware in API authorization checks yet.
- Next phase should enforce organization ownership when resolving `x-client-id` for admin users across all modules.

> _Later superseded:_ the admin default-`clientId` fallback was removed; per-request scope
> resolution and the `UserClientAssignment` join table (current design) replaced it.

---

## Phase 2 — Org-boundary enforcement across modules

Date: 2026-03-05

### Delivered
- Org-boundary enforcement applied to all client-scoped module controllers via async `resolveClientScope` checks against Prisma.
- Admin requests with `x-client-id` are now validated to ensure target client belongs to admin organization.
- Web app now sets admin context globally via top-bar client selector.
- API client auto-injects `x-client-id` for admin requests from selected client scope.
- Users page keeps explicit scope override behavior and now shows client names in table.

### Operational impact
- Admin users no longer depend on a fixed default client for day-to-day operations.
- Switching client scope in top bar applies consistently across modules.
- Cross-organization data access via header spoofing is blocked server-side.

### Remaining follow-up (phase 3)
- Add explicit Organization management screens and role split (`ORG_OWNER` vs `ORG_ADMIN`).
- Add audit trail for scope-switch actions.
- Add integration tests around org boundary checks per module.

> _Later superseded:_ the admin-only top-bar selector gave way to the always-visible
> two-state client selector (org-super → `GET /clients`, client-scoped → `GET /clients/mine`)
> for any logged-in user.

---

## Phase 3 PR1 — Role split + backend auth

Date: 2026-03-05

### Delivered
- Added explicit org roles: `ORG_OWNER`, `ORG_ADMIN`.
- Kept legacy `ADMIN` for backward compatibility.
- Updated backend role checks/decorators to treat org-super roles as admin-equivalent for now.
- Updated Users permission logic:
  - `ORG_OWNER` can manage org-level + client-level roles.
  - `ORG_ADMIN` can manage client operational roles.
  - `SERVICE_MANAGER` remains client-scoped with narrower role assignment.
- Updated seed default admin to `ORG_OWNER`.
- Updated web RBAC constants and route/action checks to recognize org-super roles.

### Compatibility
- Existing `ADMIN` users continue to work as org-owner-equivalent during transition.
- Next PR introduces dedicated Organization management UI and org-super user workflows.

> _Later superseded:_ the `ORG_OWNER`/`ORG_ADMIN`/`ADMIN` role model carried forward, but the
> full multi-client assignment model and subset-management authorization rules were defined in
> [docs/MULTI_CLIENT_ASSIGNMENT_DESIGN.md](MULTI_CLIENT_ASSIGNMENT_DESIGN.md).
