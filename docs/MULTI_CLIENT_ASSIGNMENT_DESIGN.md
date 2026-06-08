# Multi-Client Assignment (Card A) — Design & Build Spec

**Status:** Design complete, build pending (phased)
**Significance:** Foundational. Touches the tenant-isolation core. Highest-risk change in the project to date.
**Author/decisions:** Jake, designed 2026-06.

---

## 1. Purpose

Allow internal Assured Digital staff (SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER) to be
assigned to **multiple clients** and work across them, while client-own users (CLIENT_VIEWER, future
CLIENT_ADMIN) remain locked to their single client.

Today the platform assumes **one user → one `clientId`** (a scalar on the User table). This single
assumption is load-bearing for the entire multi-tenant isolation guarantee. This change replaces it
with a many-to-many assignment model, done carefully and phased, with isolation re-verified.

### What this unblocks
- Internal staff working across several clients (the consultancy model).
- The client scope selector showing a user *their assigned* clients (auto-select if one, switch if many).
- Correct, client-scoped assignee pickers (the "assignee only shows Unassigned" bug — assignable =
  staff assigned to the current client). NOTE: the assignee *picker feature itself* is partly unbuilt
  (the field is a `text` input, no assignable-users endpoint exists) — see Phase 5.

### Explicitly OUT of scope
- Contact numbers on users (separate small additive task — do independently).
- Any change to client-own user behaviour (they stay single-client locked).

---

## 2. Settled design decisions

1. **Data model: a join table `UserClientAssignment` (many-to-many).** This *is* the end-state
   architecture — a scalar column cannot express multi-client. Not transitional scaffolding.
2. **Resolution: per-request lookup, not JWT-embedded.** The JWT does NOT carry the assignment list.
   Assignments are resolved per request (indexed query, piggybacking the DB call `resolveClientScope`
   already makes). Rationale: always current (assignment changes take effect immediately, no stale
   token / re-login), no cache-invalidation debt, scope logic stays in one place. Lower debt than
   embedding a list that goes stale.
3. **Keep `User.clientId` for ONE phase as a safety net, then DROP it firmly in Phase 3.** Not lasting
   duality — the old scalar is removed once the join table is proven. This gives a fallback during the
   riskiest migration without leaving permanent two-model debt.
4. **Active-client model.** A multi-client user works "in" one client at a time, chosen via the scope
   selector. The backend validates the selected client is one they're actually assigned to.
5. **Phased, behaviour-preserving foundation.** Phases 1–2 change nothing observable (single-client
   users get exactly one assignment row → behave identically). Multi-client capability layers on top
   afterward. No big-bang rewrite.
6. **Isolation re-verification is a mandatory phase**, not an afterthought.

---

## 3. Data model

```prisma
model UserClientAssignment {
  id        String   @id @default(cuid())
  userId    String
  clientId  String
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([userId, clientId])   // a user can't be assigned to the same client twice
  @@index([userId])              // fast "this user's assignments" lookup (per-request resolution)
  @@index([clientId])            // fast "who is assigned to this client" (assignee picker)
}
```

- Add the inverse relations on `User` and `Client` models (`assignments UserClientAssignment[]`).
- `User.clientId` is **kept** through Phase 2, **dropped** in Phase 3.
- `onDelete: Cascade` — deleting a user or client cleans up assignments. (Note: ties loosely to the
  separate client-deletion / cascade card; assignments are simple cascade, low risk.)

### Org-level users (ORG_OWNER/ORG_ADMIN/ADMIN)
Unchanged. They are org-super roles with cross-client *view* privilege via the selector; they do NOT
use assignments (they can see all clients in their org). Assignments are for client-scoped roles only.

---

## 4. The isolation core: `resolveClientScope` changes

This is the single chokepoint all scope flows through (`apps/api/src/auth/request-context.ts`).
ALL ~14 services call it and receive a validated `clientId`. Because it is centralised, the services
do NOT individually change — this is the saving grace that keeps the change contained.

### Current logic (single-client)
- Org-super role: requires `x-client-id` (or default), validates client exists + same org, returns it.
- Client-scoped role: returns `user.clientId`; rejects if a *different* client is requested
  ("Cross-client access denied").

### New logic (multi-client)
- Org-super role: **unchanged** (still header-driven, org-validated).
- Client-scoped role:
  1. Fetch the user's assigned clientIds (indexed query on `UserClientAssignment`).
  2. If a client is requested (header):
     - **Validate it is IN their assignments.** If yes → scope to it. If no → reject
       ("Not assigned to this client") — the cross-client guard, generalised from "== one client" to
       "IN assigned set".
  3. If no client requested:
     - Exactly one assignment → scope to it (auto).
     - Multiple assignments → require a selection (or default to one deterministically; selector
       normally provides it).
     - Zero assignments → reject ("No client assignments") — a client-scoped user with no assignment
       has no scope (and should not exist in normal operation).
  4. Cross-org still forbidden (the assigned client must be in the user's org).

### Phase-2 behaviour-preserving guarantee
During Phase 2, read assignments from the join table. A backfilled single-client user has exactly one
assignment = their old `clientId`, so the logic returns the identical result. **No observable change
for existing users.** This is what makes Phase 2 safe to verify in isolation.

---

## 5. Migration & backfill

### Phase 1 migration (additive)
- Create `UserClientAssignment` table (+ indexes, unique constraint).
- **Backfill:** for every existing user with a non-null `clientId`, insert one assignment row
  (userId, clientId). Org-level users (null clientId) get no rows.
- Keep `User.clientId` column (untouched).
- Additive only — no drops, no behaviour change. Safe against existing rows.
- Verify locally via `migrate reset` (rebuilds all migrations) AND test the backfill against a DB with
  existing users (test env has seeded users — the realistic check).

### Phase 3 migration (the drop)
- Once Phase 2 is verified (everything reads the join table, isolation holds), drop `User.clientId`
  in a separate additive-style migration.
- Before dropping: grep the entire codebase for `clientId` references on the user/JWT path and confirm
  NONE remain that read `User.clientId` directly. The JWT must no longer carry it (see Phase 2).

---

## 6. JWT / auth flow

- The JWT currently carries `clientId`. In Phase 2, scope is resolved per-request from assignments, so
  the token's `clientId` becomes **unused for scope** (resolution no longer depends on it).
- In Phase 3, remove `clientId` from the JWT payload entirely (and from `JwtUser` type), since nothing
  reads it. Login response `user.clientId` likewise deprecated/removed on the same beat.
- Re-login / token refresh is NOT required for assignment changes to take effect (per-request lookup),
  which is the whole point of choosing per-request.

---

## 7. Frontend

### Scope selector (Shell.tsx) — Phase 4
- For a client-scoped user, populate the selector from **their assigned clients**, NOT `GET /clients`
  (admin-only). Likely a new endpoint `GET /clients/mine` (extends the `/clients/me` pattern already
  built — own-client → own-clientS). Returns the list of clients the caller is assigned to.
- Behaviour: zero assignments → (shouldn't happen) no scope; one → auto-select, no switcher shown
  (current non-switcher behaviour); multiple → show switcher with their assigned clients only.
- `canSwitchClients` becomes: org-super role OR (client-scoped AND assignment count > 1).
- The breadcrumb client label (the `/clients/me` work) generalises: shows the *active* assigned client.

### Assignment UI (user drawer) — Phase 4
- Replace the single Client field in `UserFormDrawer` with a **multi-select of clients** for internal
  client-scoped roles. Admin assigns a user to one or more clients (writes assignment rows).
- Client-own roles (CLIENT_VIEWER) keep single-client (one assignment, created under their client).
- Person-row display already renders assigned client(s) as a list (built multi-client-ready earlier) —
  it will now show multiple correctly with no rework.

### Assignee picker — Phase 5
- Build the missing feature: a `GET /users/assignable` endpoint (operational-role-callable, returns
  minimal id+name list of staff **assigned to the current client**), and change the assignee field
  from `type: "text"` to a real user-select populated from it, across record types (service requests,
  tasks, incidents, changes, checks).
- This both fixes the "only Unassigned" bug AND scopes assignment correctly to client-assigned staff.

---

## 8. Phased build plan

Each phase is independently verifiable. Phases 1–2 are behaviour-preserving (foundation).

| Phase | What | Risk | Verify |
|---|---|---|---|
| **1** | Schema: join table + backfill existing assignments. Keep `clientId`. | Low (additive) | migrate reset clean; backfill correct on test (existing users get one assignment each) |
| **2** | Backend: `resolveClientScope` reads assignments. JWT clientId becomes unused for scope. **Behaviour-preserving** (single-client users unchanged). | **HIGH — isolation core** | **Full isolation re-verification** (see §9). Single-client users behave identically. |
| **3** | Drop `User.clientId` (schema + JWT payload + types). Confirm no readers remain. | Medium (removal on auth path) | App works; login works; grep confirms no `User.clientId` readers |
| **4** | Scope selector from assignments (`GET /clients/mine`) + assignment UI (multi-select in drawer). | Medium | Multi-client user sees/switches assigned clients; admin can assign multiple |
| **5** | Assignee picker: `GET /users/assignable` + real user-select across record types. | Medium | Assignable list = staff assigned to current client; assignment works for SERVICE_MANAGER |

Build one phase per session (or per focused block). Do NOT collapse phases — the separation IS the
risk control. Phase 2 especially gets its own verification before proceeding.

---

## 9. Isolation re-verification plan (mandatory, Phase 2 + after Phase 5)

The single most important part. After the scope logic changes, re-prove tenant isolation holds under
the new model. Re-run / extend the isolation tests from the earlier verification work:

1. **Assigned-client access:** a multi-client user CAN reach each client they're assigned to (and sees
   that client's data only when scoped to it).
2. **Unassigned-client denial:** the same user, requesting a client they are NOT assigned to (via
   `x-client-id`), is REJECTED ("Not assigned to this client"). Test with a real second client they
   lack an assignment to.
3. **Cross-org denial:** still blocked (assigned client must be in the user's org).
4. **Single-client parity (Phase 2):** a backfilled single-client user behaves identically to before
   (sees exactly their one client, rejected for any other).
5. **Org-super unchanged:** ORG_OWNER/ADMIN still switch all clients in their org, blocked cross-org.
6. **Header-spoof:** a client-scoped user cannot reach an unassigned client by setting `x-client-id`
   to it — the backend validates against assignments, not the header's word.

Verify on the test environment (seeded multi-client data), then again on prod after deploy, before
colleagues enter real data.

---

## 10. Debt & efficiency notes (why this is the low-debt path)

- **One chokepoint changes** (`resolveClientScope`), not 14 services — leverages existing centralisation.
- **Per-request resolution** avoids stale-token reconciliation logic (the JWT-list option's hidden debt).
- **Additive-then-consolidate** migration: `clientId` kept one phase for safety, dropped in Phase 3 —
  no lasting two-model duality.
- **Behaviour-preserving foundation** (Phases 1–2): the scary change ships without altering anyone's
  experience, verified, before capability is layered on.
- Doing this properly now *avoids* the debt of repeated interim client-scoping hacks (assignee picker,
  selector, etc.) each working around the single-client limitation differently.

---

## 11. Deployment notes

- Phases 1 and 3 include **migrations** → full pipeline (new API image + migrate step runs for real).
  Watch the migrate step on test (against seeded users) then prod. Additive where possible.
- Phases 2, 4, 5 are code (+ Phase 5 new endpoint) → full pipeline, no schema (except as noted).
- Each phase: local verify → test (with isolation re-verification at Phase 2) → prod.
- Colleagues do NOT enter real data until the full sequence is built and isolation re-verified on prod.
