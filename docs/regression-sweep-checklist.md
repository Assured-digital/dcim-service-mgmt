# Regression Sweep Checklist

Date: 2026-03-05

## 1) Authentication and Session
- [ ] Login with valid credentials stores access token + user context.
- [ ] Invalid login returns structured API error in UI.
- [ ] Access token expiry triggers silent refresh and retried request.
- [ ] Logout revokes refresh token and redirects to `/login`.
- [ ] Disabled user cannot log in.

## 2) RBAC + Tenant Scope
- [ ] Org-super roles (`ORG_OWNER`, `ORG_ADMIN`, `ADMIN`) can access all pages including Users and Clients.
- [ ] `SERVICE_MANAGER` cannot access the Users or Clients routes (org-super only).
- [ ] `SERVICE_DESK_ANALYST` cannot access Users route.
- [ ] `ENGINEER` cannot access Triage or Users.
- [ ] `CLIENT_VIEWER` can view allowed lists but cannot perform create/update actions.
- [ ] Cross-tenant data access is blocked: a client-scoped user sending another client's `x-client-id`
      gets `403`; control returns their own data.

## 3) Module Regression
- [ ] Dashboard loads all cards without console errors.
- [ ] Triage list + convert/reject flow works.
- [ ] Service Requests list/create/status update works.
- [ ] Incidents list/create/status update works.
- [ ] Tasks list/create/status update + incident linking works.
- [ ] Assets list/create works with owner validation.
- [ ] Checks list, detail, item responses, and submit/approve flow work.
- [ ] Users list/create/update works for allowed roles (org-super only).

## 4) UX States
- [ ] Every page shows loading state while queries run.
- [ ] Every page shows consistent error state on API failure.
- [ ] Every page shows empty state when no records exist.
- [ ] Unauthorized actions are hidden/disabled in UI.

## 5) Responsive Behavior
- [ ] Mobile drawer opens/closes and navigation works.
- [ ] Header/logout remain accessible on small screens.
- [ ] Data tables are usable on narrow viewports (horizontal scroll).

## 6) Suggested Test Accounts
Create these in Users page for validation (org-super accounts must be seeded or created by an
existing org-super user):
- `owner@dcm.local` (`ORG_OWNER`)
- `orgadmin@dcm.local` (`ORG_ADMIN`)
- `manager@dcm.local` (`SERVICE_MANAGER`)
- `analyst@dcm.local` (`SERVICE_DESK_ANALYST`)
- `engineer@dcm.local` (`ENGINEER`)
- `viewer@dcm.local` (`CLIENT_VIEWER`)

## 7) Smoke Commands (Docker)
```bash
docker compose up --build
```
- Web: `http://localhost:5173`
- API docs (Swagger UI): `http://localhost:3001/api` (JSON spec at `/api-json`)
