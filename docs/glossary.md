# Naming Glossary — Architecture Docs ↔ Code/UI Terms

**Purpose.** The two target architecture documents (*Architecture Principles v1.0* and the
*ADR & Solution Architecture Pack v2.0*) use a few domain terms that differ from the terms
used in this codebase and UI. This glossary maps them so the docs and the code can be read
side by side.

**The code/UI terms are canonical — there is no rename.** This was a locked decision
(platform-gap backlog, Decision 4: "keep code terms + glossary"). Where a doc term differs,
translate it using this table; do **not** change identifiers, UI strings, or URLs to match
the doc. Source of truth for the canonical terms is `CLAUDE.md` (Conventions) and
`apps/api/prisma/schema.prisma`.

---

## Physical / DCIM domain

The canonical physical hierarchy in code is:

`Organization → Client → Region → Site → Room → Cabinet → Asset`

| Doc term | Code / UI term | Notes |
|---|---|---|
| **Rack** | **Cabinet** | Hard rule — "Cabinet, never Rack" in code, UI, and URLs (`Cabinet` model, `/asset-hierarchy`, `CabinetDetailView`). A previously-used physical term, standardised away. |
| **Data Centre** / **Data Center** | **Site** | The top of a client's physical estate (`Site` model). A "data centre" in the docs is one `Site`. |
| **Building** | *(collapsed into `Site`)* | No sub-building level today. A multi-building estate is modelled as multiple `Site`s. Only split out if real demand appears (backlog E2 — demand-driven). |
| **Campus** | *(not modelled)* | No `Campus` entity yet. Multiple `Site`s can be grouped by **`Region`** (an optional roll-up: `Site.regionId → Region`). A first-class `Campus` (with ducts/chambers/fibre) is the **Connect Insight / E1** product line, not the DCIM core. |
| **Region** *(no direct doc term)* | **Region** | Code-only grouping of `Site`s for the multi-site estate view (`Region` model, `Site.regionId`). Client-scoped. |
| **Room** | **Room** | Same term (`Room` model). |
| **Device** / **Equipment** | **Asset** | The installed unit inside a `Cabinet` (`Asset` model; flat view at `/asset-register`, hierarchy at `/asset-hierarchy`). |
| **OSP** (campus maps, ducts, chambers, fibre routes, surveys) | *(not modelled — E1)* | Outside-plant domain. Reserved for **Connect Insight (E1)**: `Campus`, `Duct`, `Chamber`, `FibreRoute`/`FibreStrand`, `Survey`. Not present in the current schema. |

---

## Service Desk / ITSM domain

| Doc term | Code / UI term | Notes |
|---|---|---|
| **Ticket** (a single unified type) | **The six work-item types** | Decided: keep the six types, no merge (backlog Decision 3). There is **no** single `Ticket` entity. The types are **Service Request**, **Incident**, **Change** (a.k.a. Change Request), **Task**, **Risk**, **Issue**. The unified feel is delivered via `RecordLink` + the shared `RecordDetailShell`, not a merged model. A thin cross-type numbering layer is a *later option only* if one ticket number becomes a hard requirement. |
| **Change** | **Change** / **Change Request** | UI/route "Change"; model `ChangeRequest`; notification/source type `ChangeRequest`. |
| **Knowledge** / **Knowledge Base article** | **KnowledgeArticle** | `KnowledgeArticle` model + `/knowledge`. |
| **Field work** / **Inspection** | **Check** (+ **CheckTemplate**) | Field-work checklists (`Check`, `CheckTemplate`); route `/checks`, UI label "Field Work". |
| **Maintenance** | **MaintenanceLog** | Per-asset maintenance records (scoped via `asset.clientId`). |

---

## Commercial / CRM domain

| Doc term | Code / UI term | Notes |
|---|---|---|
| **Partner** / **Vendor** / **Referral** | *(not modelled — `Contact` only)* | No `Partner` model today; third-party relationships are represented as `Contact`s. Add a `Partner` model only on real CRM demand (backlog E2 — demand-driven). |
| **Deal** / **Opportunity** | **Opportunity** | `Opportunity` model; pipeline stages. |
| **Renewal** | **WorkPackage** with `renewalDate` | Renewals are driven off `WorkPackage.renewalDate` (the CRM sweep auto-raises a `RENEWAL` opportunity). |
| **Account** | **Client** | A CRM "account" is a `Client` (see Platform below). |

---

## Platform / tenancy / access

| Doc term | Code / UI term | Notes |
|---|---|---|
| **Customer** / **Tenant** / **Account** / **Organisation (client)** | **Client** | The tenant unit and isolation boundary (`Client` model; `clientId` scoping via `resolveClientScope`). Every record is client-scoped. |
| **Organisation** (the AD-staff org / provider) | **Organization** (`organizationId`) | The provider organisation that owns clients. **UI string** uses British "Organisation"; **code identifier** is US-spelled `organizationId` (see Spelling below). |
| **Module** / **Licensed module** | **PlatformModule** + **ClientModuleEntitlement** | Per-client module licensing (`PlatformModule` enum = `SERVICE_DESK`, `DCIM`, `CRM`, `OPERATIONS`; `ClientModuleEntitlement` join). Gated by `ModuleEntitlementGuard`. |
| **User role** | **`Role` enum** | `ORG_OWNER`, `ORG_ADMIN`, `ADMIN` (legacy — never offer for new users), `SERVICE_MANAGER`, `SERVICE_DESK_ANALYST`, `ENGINEER`, `CLIENT_VIEWER`, `PUBLIC_USER`. Where the docs use generic role names (e.g. "administrator", "engineer"), map to the nearest enum member; there is no separate role vocabulary. |
| **SSO / Identity** | **Entra ID / OIDC** | Microsoft Entra SSO (ADR-003), live on test + prod. |

---

## Architecture-intent reconciliations

Three points honour the docs' **intent**, not their literal wording (locked decisions):

| Doc wording | How this platform realises it | Why |
|---|---|---|
| "Independently deployable modules" (Principle 8) | **Modular monolith** — one deployable, with module boundaries + an internal **domain-event bus** (ADR-006, see `apps/api/src/events/`) so modules react to events rather than calling each other. | Distributed microservices aren't warranted at this scale; the event bus gives the decoupling without the operational cost. |
| A single "**Ticket**" type | **Six work-item types** (see Service Desk above) unified by `RecordLink` + shared detail shell. | Preserves the distinct lifecycles; the unified experience is delivered at the UI/link layer. |
| "**Rack**" / "**Data Centre**" | **Cabinet** / **Site**. | Long-standing house terminology; canonical in code, UI, and URLs. |

---

## Spelling & identifier convention

- **British spelling in UI strings only** — e.g. labels read "Organisation", "Optimisation", "Licence".
- **Code identifiers stay US-spelled** — `organizationId`, `clientId`, `licenseKey`, etc. (matches the schema). Never British-spell an identifier.
- **"Cabinet", never "Rack"** — in code, UI, and URLs.

---

*Maintenance:* when the architecture docs introduce a new term, or a new domain model lands
that a doc term maps to, add the row here rather than renaming code. Keep this in sync with
`CLAUDE.md` (Conventions) and `apps/api/prisma/schema.prisma`.
