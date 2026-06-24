# ADSM Roadmap

AD Service Management (ADSM) is a multi-tenant DCIM + ITSM platform for Assured Digital — data-centre
asset management plus a service desk for multiple client organisations. This document is the **narrative**
over the live GitHub board ([Project #2 — Delivery](https://github.com/orgs/Assured-digital/projects/2)):
the board (Todo / In Progress / Done) is the source of truth for *state*; this doc is the source of truth
for *shape and sequence*. Milestones map to delivery horizons (**Now / Next / Later**). Issue numbers link
to the work.

## Platform-first delivery

Four foundational platform capabilities underpin several features — **build the platform before the
feature that needs it.**

**Platforms (build first)**
- **#154 — Notifications platform** · event model, in-app inbox, email channel, per-user/role/stakeholder targeting.
- **#151 — Outbound email** (Azure Communication Services) · the send-mail primitive.
- **#152 — Inbound email routing** · route replies / new mail onto records.
- **#153 — SSO/OIDC** (Microsoft Entra) · federated sign-in. *(split out of #92)*

**Features on those platforms (build after)**
- **#155 — Email-as-conversation in tickets** — *blocked by* **#152** (inbound email).
- **#156 — Assignee & stakeholder email alerts** — *blocked by* **#154** (notifications) + **#151** (outbound email).

Build order: `#151` `#152` `#153` `#154` first → then `#155` (needs #152) and `#156` (needs #154 + #151).

## Standalone features

Independent of the platform tier above:

- **#157 — Move Tasks into Service Desk** · relocate + consolidate; absorbs #127 and the Tasks dark-mode work.
- **#158 — Attachments upgrade** · 3-dots actions menu + per-attachment notes.
- **#159 — Print/export any record as PDF** · reuse the Checks pdfkit generator.
- **#160 — Dashboards + "My Work"** · relates to #60.
- **#161 — Client/user data depth** · umbrella over #103, #130, #96.
- **DCIM build-out** · asset detail #49, hierarchy landing #107, unpositioned assets #108, map geocoding
  #106 (+ #51, #52, #53, #109). DCIM dark mode folds into the rebuild.

## Ongoing workstreams

Continuous work that sits outside the feature roadmap — each cluster has a home here:

- **Ops / CI / deploy hardening** — pipeline + edge security: #76, #77, #78, #79, #81, #82, #83, #90, and the WAF half of #92.
- **Tech-debt & code quality** — debt waves + offenders: #62, #63, #64, #65, #66, #67, #69, #117.
- **Engineering Checks build-out** — list / calendar / detail / analytics + export: #55, #56, #57, #58, #68.
- **Service Desk core UX** — Incidents frontend, queue views, Zendesk-level lift: #59, #60, #61.
- **Audit trail** — DataGrid / filtering + role visibility: #95, #111.
- **Workflow foundation** — status transitions (#128, active) + approvals (#132, deferred — depends on the notifications platform #154).
- **Misc platform** — content-window flicker #105, UserDisplay component #124.

## Deferred / later

Parked in the `Later` milestone:

- **#162 — Separation-of-duties on checks** (executor ≠ verifier).
- **#132 — Approvals** design brief *(also gated on #154 — see below)*.
- **#68 — CSV export for check templates** *(blocked)*.
- **#69 — Breaking-change dependency upgrades** *(blocked)*.
- **#76 — Deploy Phase 5 — ops hardening** *(ongoing)*.
- **#90 — Entra passwordless for Postgres** *(post-pilot)*.

## Dependency note

The hard build-before edges to respect:

- **#155** (email-as-conversation) → needs **#152** (inbound email routing).
- **#156** (assignee / stakeholder alerts) → needs **#154** (notifications) + **#151** (outbound email).
- **#132** (Approvals) → needs **#154** (notifications platform).
