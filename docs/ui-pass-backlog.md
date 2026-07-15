# UI & Flow Pass — Backlog

Running list of UI/flow refinements to fold into the **full UI & flow pass** (the pass
Jake wants once the platform-gap feature backlog is closed — see
`docs/platform-gap-backlog.md`). These are polish/interaction items, not new features.
Captured as they come up so they aren't carried in anyone's head.

Started 2026-07-14.

---

## Navigation & layout

### U1 · Collapsible side menu in record detail — mirror the assets tree collapse
**Ask (Jake, 2026-07-14):** once you're in a **record detail**, the side menu should be
**collapsible**, following the **same flow as the side menu in the assets view**.

**Reference pattern to reuse — the asset hierarchy tree collapse** (`apps/web/src/routes/AssetHierarchyPage.tsx`
~L373–377, "Collapsible hierarchy tree (Hyperview pattern)"):
- a `treeCollapsed` boolean that **collapses the panel to a thin rail** (hands the room to the main content),
- a toggle control, and
- **sticky per browser** via `localStorage` (`dcms_estate_tree_collapsed`) so the choice survives navigation.

Apply the equivalent to the record-detail experience so the detail content can claim
more width, with the same collapse-to-rail affordance + persisted state.

**To confirm during the pass — which "side menu":**
- (a) the **main left nav** (`apps/web/src/routes/Shell.tsx` sidebar) — collapse it to a rail while viewing a record detail; or
- (b) the record-detail **right column** (the Details panel in `apps/web/src/components/detail/RecordDetailShell.tsx`).
Jake's phrasing ("side menu … in a record detail") most likely means (a) the main nav — verify at pass time.

**Guardrails:** preserve the shared `RecordDetailShell` pattern (`RECORD_DETAIL_SPEC.md`)
and list-page full-bleed behaviour; the collapse should be a layout concern only, no
change to what each detail page composes.

---

## Documents, emails & exports — visual design + in-app management

Cross-cutting theme (Jake, 2026-07-15): everything we generate that leaves the app as a
**document or message** is currently *functional but not designed*, and none of it is
*configurable in-app*. Two related asks: (1) proper visual design; (2) admin-settings
management (branding, templates, per-client logo/colours, from-name) where feasible.

### U2 · Notification emails — design + admin management
- **Current:** `apps/api/src/notifications/notification-email.ts` sends bare HTML (a one-line
  `<p>`, an "Open it" link, a muted footer). Plaintext-ish, unbranded.
- **Want:** a proper branded email template (logo, colours, layout matching the app), and
  in-app admin control (from-name, branding, maybe per-org/per-client). 
- **Done now (2026-07-15):** email is **off by default** (opt-in per user via notification
  settings); master switch `NOTIFICATIONS_EMAIL_ENABLED` unchanged. Design + admin control
  remain for the pass.
- **Possible admin surface:** an org/client "Notifications & branding" settings page.

### U3 · Exported documents — design + admin management
- **Applies to every pdfkit export + CSV:** record report (`records-report/`), infrastructure
  report (`dcim/infrastructure-report`), **check completion report** (`checks/checks-report`),
  the new **D3 reporting summary** PDF/CSV (`reporting/`). All share
  `apps/api/src/common/reporting/report-kit.ts` (branded header, palette, footer).
- **Current:** consistent but utilitarian — one house style, no per-client branding, no
  in-app configuration.
- **Want:** visual polish (cover/layout/typography), and admin-settings control of report
  branding (logo, colours, header/footer, maybe cover page) — ideally per client, since these
  are shared WITH clients. Reuse the shared `report-kit` so one change reprints everywhere.
- **Note:** the shared kit is the leverage point — design/brand it once, all reports inherit.

---

## (add further UI-pass items below as they come up)
