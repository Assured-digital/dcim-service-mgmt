# Record Detail Page — Implementation Spec
## AD Service Management Platform

This document is the single source of truth for all record detail pages in the platform. Every detail page — Incident, Change, Service Request, Task, Risk, Issue, Maintenance, Check — uses the same `RecordDetailShell` component and the same interaction patterns. Only the field configuration and status lifecycle differ per type.

Read this entire document before writing any code.

---

## 1. Architecture

### 1.1 Shell component

All detail pages render `RecordDetailShell` as their root element. The shell owns:

- The two-column layout (scrollable centre, fixed right panel). **There is no top bar** — it was
  removed; its contents were relocated (see §2/§3): the **status cluster** (status button + `…` menu)
  sits at the **top of the right column**, and the **Reference** (and Type, via the page's own field)
  live in the Details panel.
- The `statusCluster` (status button + `…` overflow) — a single control rendered at the right-column
  top on the main page, or **portaled into the drawer header** when the shell renders inside the narrow
  association-peek drawer (see §2.2).
- The `StatusPopover` component (shared, reusable)
- Global click-outside handling to close any open popover

The shell accepts these props:

```ts
interface RecordDetailShellProps {
  // Top bar
  backLabel?: string                    // defaults to "Back"
  onBack?: () => void                   // defaults to navigate(-1)
  recordRef: string                     // e.g. "IN-2026-6620" — shown in the Details panel + breadcrumb
  typeBadge: React.ReactNode            // RETAINED for API compatibility but no longer rendered by the
                                        // shell (the type reads from the page's own "Type" detailField;
                                        // a relocated chip would duplicate it)
  currentStatus: string                 // e.g. "INVESTIGATING"
  statusConfig: StatusConfig            // defines all statuses and their appearance
  onStatusChange: (to: string, dialogData?: Record<string, string>) => void
  moreMenuItems?: MoreMenuItem[]        // items for the ... dropdown

  // Centre column slots
  titleCard: React.ReactNode            // subject + description (always present)
  rightSections?: RightSection[]        // the associations — rendered in the CENTRE as Jira panels, reordered Linked → Tasks → Attachments (legacy prop name; pre-dates the move from the right column)
  sections: CentreSection[]            // ordered centre sections after the associations (Activity, plus type-specific ones like Implementation/Assessment)

  // Right panel slots — the Details fields only (always-visible, non-collapsible)
  detailFields: DetailField[]           // the "Details" key-value list — rendered in the RIGHT column
  metadata?: RecordMetadata             // Submitted by / Created / Updated — rendered under the Details list

  // State
  loading?: boolean
  error?: string
}
```

### 1.2 What the page file owns

Each record type's page file (`IncidentDetailPage.tsx` etc.) is responsible for:

- Fetching data via existing queries — do not change query keys or endpoints
- Composing shell props from fetched data
- Defining its `statusConfig`, `detailFields`, `sections`, and `moreMenuItems`
- Handling mutations (status change, field patch, comment post)

Page files should be thin. Heavy logic lives in the shell and shared components.

---

## 2. Layout

**No top bar.** The shell is two columns; the status cluster sits at the top of the right column.

```
┌─────────────────────────────────────────┬────────────────────────────────┐
│  CENTRE (flex:1, scrollable)            │  RIGHT (300px, scrollable)     │
│  = the record + its associations        │  [Status▾] [...]      [← Back] │ ← status cluster (left),
│                                         │                                │   Back only on standalone
│  Subject                                │ ┌ Details ──────────────────┐  │   routes (right)
│  [Title]                                │ │ Reference   IN-2026-6620  │  │
│  Description                            │ │ Type        Incident      │  │
│  [Description text]                     │ │ Severity    MEDIUM ▾      │  │
│ ┌ Linked records ────────────── + ─┐    │ │ Priority    Medium ▾      │  │
│ │  [record rows]                    │   │ │ Assignee    Unassigned ▾  │  │
│ └───────────────────────────────────┘   │ │ ───────────────────────   │  │
│ ┌ Tasks ─────────────────────── + ─┐    │ │ Submitted by  —           │  │
│ │  [task rows]                      │   │ │ Created    29 Apr, 11:36  │  │
│ └───────────────────────────────────┘   │ │ Updated    29 Apr, 20:52  │  │
│ ┌ Attachments ───────────────── + ─┐    │ └───────────────────────────┘  │
│ │  file.pcap                        │   │  (always visible, no chevron)  │
│ └───────────────────────────────────┘   │                                │
│  ▾ Activity   11 events                 │                                │
└─────────────────────────────────────────┴────────────────────────────────┘
```

The split (Jira model): **centre = the record + its associations**
(subject → description → Linked records → Tasks → Attachments → Activity);
**right = the status cluster + the Details fields**.

- Centre column: `flex: 1`, `overflow-y: auto`, `padding: 24px`. Order: title card (subject +
  description) → the `rightSections` rendered as **association panels** in the fixed order
  **Linked records → Tasks → Attachments** → the `sections` (Activity, plus any type-specific
  centre sections). Each association is a **Jira-style `SectionPanel`** (bordered, header + thin
  divider, squarer corner — see §2.1) with a **`+` add button on its header row** (see §5.1b).
- Right panel: `width: 300px`, `flex-shrink: 0`, `border-left`, `overflow-y: auto`, `p: 2`. Holds the
  **status cluster** at the top (status pill + `…` overflow, **left-aligned**; a Back icon on the right
  for standalone routes only) followed by the **Details key-value list** — a single **always-visible**
  (no chevron/toggle) Jira-style `SectionPanel`. The shell builds Details from a **Reference** row +
  `detailFields` + `metadata`.
- The shell reorders incoming `rightSections` by `CENTRE_ASSOC_ORDER = ["linked","tasks",
  "attachments"]` (unknown ids fall to the end), so pages may supply them in any order.
- No left panel — the previous three-column layout is retired.
- The shell sets `display: flex; height: 100%` on the body container.

### 2.2 Drawer (narrow) layout

When the shell renders inside the Service Desk navigator's **depth-2 association-peek `<Drawer>`**
(~50vw), it reads a `useDetailNarrow()` flag and stacks to a **single scrolling column** (the right
column drops inline). The drawer's own header is `X (left) … status + … (right)`, where the status
cluster is **portaled** out of the shell into the header slot (via `useDetailDrawerChrome()`) and
**"Open full" is an item inside the `…` overflow menu** (not a standalone button). The stacked order is:

```
Subject → Description → Details → Linked records → Tasks → Attachments → Activity
```

The main (non-drawer) page is unaffected — it stays two-column with Details in the right column.

### 2.1 `SectionPanel` (Jira-style container)

Both the centre association sections and the right-column Details panel render inside the shared
`SectionPanel` (local component in `RecordDetailShell.tsx`), giving a consistent Jira look:

- `border: 1px solid` `divider` (`#e2e8f0`), `bgcolor: background.paper`, no/low shadow (flat).
- **Squarer corner:** `borderRadius: PANEL_RADIUS` (currently `6px`) — a **local** constant that
  deliberately overrides the global `shape.borderRadius` (12). The global token is unchanged here;
  squaring it app-wide is a separate prompt. If the global radius is later squared, drop `PANEL_RADIUS`.
- **Header:** optional `title` (+ optional `icon`/`headerExtra`) in a `px:1.75 py:1.25` row, followed
  by a thin `Divider`. Omit `title` for a header-less panel. Body padded `px:1.75 py:1.5`.

---

## 3. Status cluster (right-column top)

There is no top bar. The status pill + `…` overflow form the **`statusCluster`** at the top of the
right column (main page) or in the drawer header (narrow — §2.2). It is **left-aligned**; on standalone
routes a Back icon sits on the right of the same row.

### 3.1 Back affordance
- **In the navigator** (`useInDrillDownNavigator()`): no Back — the rail header is the back path.
- **Standalone routes**: a small `IconButton` (`ArrowBackIcon`, `borderRadius: PANEL_RADIUS`) on the
  right of the status-cluster row; `onClick` calls `onBack` prop or `navigate(-1)`.

### 3.2 Reference / Type
- The Reference (monospace) is a **row in the Details panel** (§7.1), not a top-bar pill.
- The Type renders via each page's own **"Type" detailField** (§7.2) — full name, e.g. "Incident".
  The `typeBadge` prop is retained for API compatibility but no longer rendered (would duplicate it).
  Per-type badge colours (still used elsewhere, e.g. linked-record visuals):

| Type | Label | Background | Text colour |
|---|---|---|---|
| Incident | INC | `#fcebeb` | `#a32d2d` |
| Change | CHG | `#e6f1fb` | `#185fa5` |
| Service Request | SR | `#eaf3de` | `#3b6d11` |
| Task | TSK | `#eeedfe` | `#3c3489` |
| Risk | RSK | `#faeeda` | `#854f0b` |
| Issue | ISS | `#fbeaf0` | `#993556` |
| Maintenance | MNT | `#f1efe8` | `#5f5e5a` |
| Check | CHK | `#e6f1fb` | `#185fa5` |

### 3.3 Status button (Jira pill)
- Coloured pill button — background and text match the current status colour from `statusConfig`
- **Squarer corners: `borderRadius: PANEL_RADIUS` (6px)**, consistent with the panels
- Left icon (status-specific SVG), label text, right chevron icon
- On click: opens `StatusPopover` — same popover component as field popovers
- On status change: calls `onStatusChange(to)`

### 3.4 ... menu button
- Icon button, `MoreHorizIcon`, `borderRadius: PANEL_RADIUS`, beside the status pill
- Opens a popover with `moreMenuItems` (+ **"Open full"** appended when in the drawer — §2.2)
- Each item: `{ label: string, icon: React.ReactNode, onClick: () => void, danger?: boolean }`
- Danger items render in `error.main` colour with red hover background
- Standard items for all record types: Copy link (copies `window.location.href`, shows a brief toast "Link copied"), Close [type], Cancel [type] (danger)

---

## 4. Shared popover component — `StatusPopover`

This is the single reusable component used for ALL selectable fields across the entire platform: record status, task status, severity, priority, assignee, and any other enumerated field.

```ts
interface StatusPopoverProps {
  id: string                    // unique id for the popover DOM element
  header: string                // e.g. "Severity", "Task status"
  options: PopoverOption[]
  currentValue: string
  onSelect: (value: string) => void
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
}

interface PopoverOption {
  value: string
  label: string
  iconBg: string               // background colour of the icon box
  icon: React.ReactNode        // MUI icon component
  iconColor: string            // fill colour of the icon
}
```

Visual spec:
- `Paper elevation={3}` with `border: 0.5px solid divider`, `borderRadius: 10px`, `padding: 6px`
- Header: 11px muted uppercase with letter-spacing
- Each option row: icon box (26×26px, `borderRadius: 5px`) + label text + checkmark if selected
- Checkmark: `✓` right-aligned in `primary.main` colour
- Hover: `bgcolor: action.hover`
- Selected option: `bgcolor: action.hover` always (not just on hover)
- Positioned using MUI `Popper` with `placement="bottom-start"` — falls back to `bottom-end` if clipped
- Closes on: option select, outside click, Escape key
- Only one popover open at a time — the shell manages a single `openPopoverId` state

---

## 5. Centre column

### 5.1 Title and description

Always the first element in the centre column. **No card or Paper wrapper** — renders as bare elements directly on the page background.

Structure:
```
Subject                          ← Typography variant="caption" fontWeight={500} color="text.secondary" display="block" mb={0.5}
[Title text — inline editable]   ← Typography variant="h6" fontWeight={500} px={0} mx={0}

Description                      ← same caption style, mt={1.5} mb={0.5}
[Description — inline editable]  ← Typography variant="body2" color="text.secondary" px={0} mx={0}
```

Label style rules:
- Sentence case only — "Subject" not "SUBJECT", "Description" not "DESCRIPTION"
- No `textTransform: uppercase`, no `letterSpacing`
- `fontWeight: 500`, `color: text.secondary`, `variant="caption"`
- Label and value share the same left edge — no padding or margin offset between them

Inline editing behaviour for both title and description:
- Default: renders as text, `cursor: pointer`, subtle `bgcolor: action.hover` on hover
- On click: becomes `contentEditable`, gains a `1.5px solid primary.main` border, `px: 0.5`
- On blur or Escape: commits the change and calls `onTitleChange` / `onDescriptionChange` prop
- Empty value: rejected, reverts to previous value

Wrap both in `Box sx={{ mb: 2.5 }}`.

**Backend contract:** any inline-editable centre field (title/description — `subject` for SR — plus
Change's implementation fields) must be accepted by that record's `PUT /:id` update DTO **and** persisted
in its `updateForClient`. The global `ValidationPipe({ whitelist: true })` strips properties not declared
on a typed DTO, so a field missing from the DTO (or from the Prisma `data` block) makes the UI commit
silently no-op even though the affordance works.

### 5.1b Association panels (Linked records / Tasks / Attachments)

The record's associations — **rendered by the shell in the centre column**, immediately after the title
card and before the `sections`. (Jira layout: the centre holds the record + its associations; the
**Details** key-value list lives in the right column — see §7.) These were briefly in the right column
under "Step A"; they moved back to the centre.

- The shell renders each `rightSection` as a Jira-style `SectionPanel` (§2.1) — its `title`/`icon` form
  the panel header, its `content` the body. The content components (`LinkedRecordsContent`,
  `TasksSectionContent`, `AttachmentsContent`) and **all drill/drawer/preview wiring are unchanged** —
  only the column they live in changed.
- Fixed order **Linked records → Tasks → Attachments** (the shell sorts by `CENTRE_ASSOC_ORDER`).
- Pages still supply these via the `rightSections` prop (legacy name; they now render in the centre).
  See §7.3/§7.4 for the per-association content rules (unchanged).
- **Add affordance — `+` on the header row.** Each association's add action (Link record / Add task /
  Attach file) is a **`SectionAddButton` (a `+` `IconButton`) right-aligned on the `SectionPanel` header**
  (via the panel's `headerExtra` slot), Jira-style — not a text button below the list. Pages pass it as
  `RightSection.headerAdd = { onClick, tooltip }`; the content components' inline add buttons are
  suppressed (`showAddButton={false}`) in the shell (non-shell consumers like Check keep theirs). The
  `+` darkens / enlarges / squares on hover. Attachments exposes an imperative `openPicker()` handle so
  the header `+` can trigger its (encapsulated) file input.

### 5.2 Centre sections

Each section is a `Box sx={{ mb: 2.5 }}` with a collapsible header and a `Divider` above it (except the first section directly after the title block).

**Dividers between sections:**
- `Divider sx={{ borderColor: 'divider', opacity: 0.6, my: 2 }}` between the description block and the first section, and between each subsequent section

**Collapsible section header pattern** — used for Activity and the type-specific centre sections (e.g. Implementation, Assessment):
```tsx
<Box onClick={() => setOpen(o => !o)}
  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
        mb: 1, userSelect: 'none', width: 'fit-content' }}>
  <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary',
    transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
  <Typography variant="caption" fontWeight={500} color="text.secondary">
    Tasks  {/* sentence case, no uppercase */}
  </Typography>
</Box>
```

Section label style rules (consistent with Subject/Description labels):
- Sentence case — "Activity" not "ACTIVITY"
- No icon next to the label — chevron only
- `variant="caption"`, `fontWeight={500}`, `color="text.secondary"`
- Chevron rotates -90° when collapsed, animates with `transition: transform .15s`

Wrap section body in `{open && <Box>...</Box>}`. Default open for all sections.

The event count for Activity (`11 events`) sits in the header row right-aligned using a spacer: `<Box sx={{ flex: 1 }} />` then `<Typography variant="caption" color="text.tertiary">{count} events</Typography>`. Visible even when collapsed.

The centre sections are defined by the page. They are **Activity** (always, see §6) plus any
type-specific sections — Change's **Implementation** + **Approvals**, Risk's **Assessment**, etc. (§9).
These `sections` render **after** the association panels (§5.1b). They keep their own collapsible
chevron header and are NOT wrapped in a `SectionPanel` (Activity in particular owns its collapse UX);
this is independent of the right Details panel (which is non-collapsible).

#### Activity section

See section 6.

---

## 6. Activity feed

The activity section replaces the previous Work notes / History / Timeline tab pattern. It is a unified feed.

### 6.1 Section header

"ACTIVITY" label left, event count (`{n} events`) right in muted caption.

Filter chips below — `All · Comments · Status · Assignments · Links`:
- MUI `Chip size="small"` — `variant="filled" color="primary"` when active, `variant="outlined"` otherwise
- Active filter stored in `searchParams` as `?activity=all|comment|status|assignment|link`
- Write back with `replace: true` to avoid polluting history

### 6.2 Compose box

`Paper variant="outlined" sx={{ overflow: 'hidden', mb: 1.75 }}`:
- `TextField multiline minRows={2} fullWidth placeholder="Add a work note..." variant="outlined" size="small"` with no outer border (border is on the Paper)
- Footer: right-aligned "Post note" `Button variant="contained" size="small"` — disabled when input is empty
- On post: call existing comment mutation with `{ body: value, type: 'WORK_NOTE' }`, clear input, switch filter to "All" if not already

### 6.3 Feed items

Events come from two sources merged by `createdAt` descending:
1. Audit events query (existing)
2. Comments/work notes query (existing)

Map to `FeedEvent`:
```ts
type FeedEvent = {
  id: string
  type: 'status' | 'comment' | 'assignment' | 'link'
  actor: string        // user display name or email
  text: React.ReactNode
  note?: string        // comment body — only for type: 'comment'
  createdAt: string
}
```

Each feed item:
```
[Icon circle]  [Actor name · timestamp]
               [Event description text]
               [Note body — only for comments]
```

Connector line between items: `Box sx={{ position: 'absolute', left: 12, top: 28, bottom: -8, width: 1, bgcolor: 'divider' }}` — omit on last item.

Icon circle styles (24px, `borderRadius: '50%'`):

| Type | Background | Icon | Icon colour |
|---|---|---|---|
| status | `#e6f1fb` | `PlayArrowIcon` | `#185fa5` |
| comment | `#eaf3de` | `ChatBubbleOutlineIcon` | `#3b6d11` |
| assignment | `#faeeda` | `PersonIcon` | `#854f0b` |
| link | `#fbeaf0` | `LinkIcon` | `#993556` |

Comment note body box:
`Box sx={{ borderLeft: '2px solid', borderColor: 'success.light', pl: 1, py: 0.5, bgcolor: 'action.hover', borderRadius: '0 4px 4px 0', mt: 0.5, fontSize: 12 }}`

---

## 7. Right panel

The right panel holds the **status cluster** at the top (§3) followed by **the Details key-value list**
(Jira layout). Details is a single **always-visible** (no collapse/expand) Jira-style `SectionPanel`
(§2.1) titled "Details", built by the shell from a **Reference** row + `detailFields` + `metadata`. The
associations (Tasks, Attachments, Linked records) moved to the centre — see §5.1b. The column is
`width: 300px`, `border-left`, `overflow-y: auto`, `p: 2`.

(The shared `RightPanelSection` component still exists in `RecordDetailShell.tsx` — it is no longer used
by the shell's own layout but is retained for the custom `CheckDetailPage`, which composes its own
right-column sections.)

### 7.1 Details panel (non-collapsible)

The Details panel is the single right-column `SectionPanel`. Its header is the "Details" title row + thin
divider (§2.1); its body is a **Reference** row (monospace, relocated from the removed top bar), then the
field rows (§7.2 — Type, Priority, Assignee, type-specific fields), then the read-only metadata rows
below an inner `Divider`. No chevron, always rendered. Reads as one clean list (no separator between the
Reference row and the fields). **Type is NOT duplicated** — it comes from the page's own "Type"
detailField, not a relocated badge chip.

### 7.2 Detail fields

The field-row styling and the standard-field table below govern how each `DetailField` renders inside the
Details panel.

#### Field rows

Each field row uses `display: flex, justifyContent: 'space-between', alignItems: 'center'` — label left, value right:

```tsx
<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
           px: 0.75, py: 0.5, borderRadius: 1,
           cursor: editable ? 'pointer' : 'default',
           '&:hover': editable ? { bgcolor: 'action.hover' } : {} }}>
  <Typography variant="body2" color="text.secondary">  ← label, natural width
  <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'center',
             justifyContent: 'flex-end', gap: 0.5 }}>   ← value, right-aligned
</Box>
```

No fixed width on the label — let it size naturally. Values right-align.

#### Standard Detail fields (all record types)

| Field | Editable | Display |
|---|---|---|
| Type | No | Plain text, full name — "Incident" not "INC". `color: text.secondary`. No badge, no hover |
| Priority | Yes | Coloured badge, opens StatusPopover |
| Assignee | Yes | Name or italic "Unassigned", opens StatusPopover |

Type-specific fields are added by the page above or below these standard fields.

#### Read-only metadata (always below a Divider)

These three rows appear at the bottom of every Details panel, below a `Divider`:

```
Submitted by    [value or —]
Created         [formatted date]
Updated         [formatted date]
```

Rendered as `Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.375 }}` with `variant="caption"` — label in `text.disabled`, value in `text.secondary`. Not interactive.

**"Submitted by" sources from the read response's server-resolved `createdBy.displayName` projection** (`{ id, displayName }`, attached by `resolveCreator` in `apps/api/src/users/creator.ts`) — NOT a client-side `GET /users` lookup. The old approach resolved `createdById` against the admin-only `/users` directory, which 403s for operational/customer viewers and excludes customer creators, so "Submitted by" rendered blank for them. Pages now read `record.createdBy?.displayName ?? null` directly.

### 7.3 Tasks panel

A centre association panel (§5.1b) — sits between Linked records and Attachments — for the work-item
types that have tasks (Incident, Service Request, Change, Risk, Issue). Standalone Task/Maintenance and
the custom Check page have no Tasks panel. Implemented by the **shared `apps/web/src/components/TasksSectionContent.tsx`**
component — one copy consumed by all five pages (it replaced five page-local duplicates). The page wires
it via `rightSections` with the type's task data + handlers (`tasks`, `users`, `canManage`, `onCreate`,
`onSelectTask`, `onChangeTaskStatus`, `onChangeTaskAssignee`).

Each task row: `Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.875, mb: 0.5, borderRadius: 1, cursor: 'pointer' }}`. Row contents (left to right):
- Ref: monospace 11px muted (`TSK-001`) — always shown
- Title: `flex: 1`, 12px, ellipsised
- Assignee: 22px initials avatar, or italic "Unassigned" — clickable, opens `StatusPopover`
- Status badge: 10px coloured pill (task status colour map, §10), clickable — opens `StatusPopover`

Add task is the header `+` (§5.1b) when `canManage` — not a text button below the list. Empty state: a
muted "No tasks" caption.

**Row click drills, not navigates** (§2c-i wiring): the component uses `useDrillNav()` — inside the
Service Desk navigator a row drills the task to depth 2 in place; standalone (no provider) it calls
`onSelectTask` (the quick-detail modal). Moving Tasks from the centre to the right column did not change
this — the wiring lives inside the shared component.

### 7.4 Linked records panel

Always-visible section. The **first** centre association panel (§5.1b) — above Tasks and Attachments.

**Data model — join table, not a scalar.** Links are stored in the `RecordLink` join table
(`apps/api/prisma/schema.prisma`), NOT in the old `linkedEntityType`/`linkedEntityId` scalars
(those are now dead and slated for removal). A link connects any two of the six work-item types
(`incident`, `service_request`, `change`, `task`, `risk`, `issue`) within ONE client, and is
**bidirectional/symmetric**: a link created on record A appears on record B with no extra write;
unlinking from either side removes the single edge. A record may have **many** links. Endpoints
are stored in a canonical order (`canonicalLinkEndpoints` in
`apps/api/src/record-links/resolve-links.ts`) so the uniqueness constraint collapses duplicates.

**Linked records source from the read response's server-resolved `links` projection**
(`{ linkId, type, id, reference, title, status }[]`, attached by `resolveLinkedRecords` in
`apps/api/src/record-links/resolve-links.ts`) — clientId-scoped on every lookup, so a link can
never resolve a record from another client. The page reads `record.links ?? []` directly — NOT a
client-side lookup, mirroring the `createdBy` projection (§7.3). The shared
`apps/web/src/components/LinkedRecordsContent.tsx` renders the rows; `apps/web/src/lib/linkedRecords.ts`
is the single source of truth for per-type visuals, routing, and the link/search/unlink API helpers.

Mutations go through the `record-links` module: `POST /record-links` (validates BOTH endpoints
belong to the scoped client before writing — the cross-tenant guard), `DELETE /record-links/:id`
(clientId-scoped), `GET /record-links/search?type=&q=` (powers the picker dialog,
`apps/web/src/components/LinkRecordDialog.tsx`).

Each linked record row — same style as attachment rows:
```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.625,
           borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
  {/* Coloured icon box — 26×26px, borderRadius: 1 */}
  {/* rp-info: title (12px) above, reference (10px muted) below */}
  {/* Status badge — 10px coloured pill, right-aligned, flex-shrink: 0 (omitted when status empty) */}
  {/* Unlink button — appears on row hover; omitted for hard-relation rows with empty linkId */}
</Box>
```
Row click navigates to the linked record's detail route (`routeForLink`). A Task's parent-incident
FK relation is also surfaced here as a row with an empty `linkId` (shown, but not unlinkable).

Icon and colour per link type (`LINKED_RECORD_VISUALS`):

| Type | Icon | Background | Icon colour |
|---|---|---|---|
| `incident` | `ErrorOutlineIcon` | `#fdecea` | `#b71c1c` |
| `service_request` | `AssignmentOutlinedIcon` | `#eef2ff` | `#3538cd` |
| `change` | `BuildIcon` | `#e6f1fb` | `#185fa5` |
| `task` | `TaskAltIcon` | `#eaf3de` | `#3b6d11` |
| `risk` | `WarningAmberIcon` | `#faeeda` | `#854f0b` |
| `issue` | `ReportProblemOutlinedIcon` | `#fbeaf0` | `#993556` |
| default | `LinkIcon` | `#eef2f6` | `#475569` |

If no linked records: `Typography variant="caption" color="text.tertiary"` — "No linked records"

Link record is the header `+` (§5.1b), not a text button below the list.

### 7.5 Breadcrumb

The breadcrumb shows the **URL's primary record** only. The shell calls
`useBreadcrumb().setPrimaryRecordLabel(recordRef)` on mount and clears it on unmount — writing a
**dedicated non-reset slot** (NOT `setRecordLabel`, whose shared `breadcrumbs[]` is reset on every
pathname change). This keeps the depth-1 record's crumb stable across a drill, and the **drawer
suppresses it entirely** (`useDetailNarrow()` → no write) so the drawer's record never overwrites the
main ticket's. The slot takes precedence over `breadcrumbs[]`; when no shell is mounted the trail falls
back to `breadcrumbs[]`. Produces: `Client › Module › Record ref`. Import `useBreadcrumb` from `Shell.tsx`.

Each attachment row: `Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.625, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}`

- File type icon box: 26×26px, `bgcolor: action.hover`, `borderRadius: 1`
  - `ImageIcon` for image types, `DescriptionIcon` for everything else
- File name: 12px + size + date in 10px muted below
- Download icon: `FileDownloadIcon`, 12px, muted, right-aligned

Attach file is the header `+` (§5.1b) — it triggers `AttachmentsContent`'s `openPicker()` handle, not a
text button below the list.

Empty state: show a muted "No attachments" caption (the header `+` is always the way to add the first
file). An inline "Uploading…" caption shows while an upload is in flight (the inline text button is
suppressed in the shell).

Attachments — frontend implemented for the six work-item pages (Incident, SR, Change, Task, Risk,
Issue). **Backend** also supports **Maintenance and Check** (their `getForClient` reads return
`attachments[]`; uploads/downloads/deletes accept `recordType` `maintenance`/`check`) — their detail
panels are still scaffolded pending the frontend wiring. Maintenance/Check are **attachable but
intentionally NOT linkable**: the attachment record-type list (`ATTACHMENT_RECORD_TYPES`, eight
types) is decoupled from the link list (`LINK_RECORD_TYPES`, the six). Maintenance has no
`clientId`/`reference`/`title`/`status`, so the resolver scopes it through `asset.clientId` and
synthesises its summary.

- API: `POST /attachments` (multipart `file` + `recordType` + `recordId`), `GET /attachments/:id`
  (stream/download), `DELETE /attachments/:id`. All clientId-scoped via `resolveClientScope`; the
  target record is validated in-scope before an upload is stored, and every read/delete re-checks
  `where: { id, clientId }`.
- Storage: bytes live in object storage (S3/MinIO locally) via the storage abstraction — never the
  DB; the `Attachment` row holds metadata + `storageKey`. No pre-signed URLs — bytes stream through
  the API.
- Security: uploads are validated by **magic bytes** (not the client `Content-Type`); allow-list is
  **PDF + PNG/JPEG/GIF/WebP only** (SVG rejected). Downloads serve `Content-Disposition: inline`
  ONLY for that allow-list (everything else `attachment`) and always send
  `X-Content-Type-Options: nosniff`.
- Read-back: each `getForClient` returns an `attachments[]` array of
  `{ id, filename, contentType, size, uploadedAt, inline }`, beside `createdBy`/`links`.
- Frontend: a single shared `AttachmentsContent` (panel) + `AttachmentPreviewModal`, consumed by all
  six pages via the shell's `rightSections` (replacing the old per-page scaffold), backed by
  `lib/attachments.ts`. Upload uses a file-picker → `POST` then invalidates the page's detail query.
  Clicking a row opens an in-app preview: the bytes are fetched **through the authenticated api
  client as a blob** (NOT a raw `<img>`/`<iframe>` src — the GET needs auth + `x-client-id`), shown
  via an object URL (PDF in an `<iframe>`, images in an `<img>`) that is **revoked on close**;
  non-previewable types fall back to a download button. Download and delete also fetch/act through
  the api client. Backend rejections surface as friendly toasts (413 → "file too large", 415 →
  "only PDF and images allowed"), never a raw status.

---

## 8. Status configuration

Each record type defines its own `StatusConfig`:

```ts
interface StatusConfig {
  options: StatusOption[]
}

interface StatusOption {
  value: string            // enum value e.g. "INVESTIGATING"
  label: string            // display label e.g. "Investigating"
  badgeClass: string       // colour class e.g. "b-blue"
  bg: string               // icon box background
  iconColor: string        // icon fill colour
  icon: React.ReactNode    // MUI icon for the popover
  buttonIcon: React.ReactNode // MUI icon shown on the status button itself
}
```

### Status colour map

| Status family | Badge bg | Badge text | Icon bg | Icon colour |
|---|---|---|---|---|
| New / Open / Draft | `#f1efe8` | `#5f5e5a` | `var(--bg-secondary)` | text.secondary |
| In progress / Investigating / Assigned | `#e6f1fb` | `#185fa5` | `#e6f1fb` | `#185fa5` |
| Waiting / Pending / Scheduled | `#faeeda` | `#854f0b` | `#faeeda` | `#854f0b` |
| Mitigated / Submitted | `#faeeda` | `#854f0b` | `#faeeda` | `#854f0b` |
| Resolved / Completed / Done | `#eaf3de` | `#3b6d11` | `#eaf3de` | `#3b6d11` |
| Closed / Cancelled | `#f1efe8` | `#5f5e5a` | `var(--bg-secondary)` | text.secondary |
| Rejected / Blocked | `#fcebeb` | `#a32d2d` | `#fcebeb` | `#a32d2d` |

---

## 9. Per-record-type configuration

For all types, the **Details** key-value list (the "additional detail fields" below + the standard
Type/Priority/Assignee + metadata) renders in the **right** column (§7), not the centre. The centre
lists below are the always-visible association panels (§5.1b), in order Linked records → Tasks →
Attachments. Tasks is present for the five work-item types that have tasks (Incident, SR, Change, Risk,
Issue); Task/Maintenance have no Tasks panel.

### 9.1 Incident

Additional detail fields: `Severity` (editable, options: CRITICAL / HIGH / MEDIUM / LOW)

Status order: `NEW → INVESTIGATING → MITIGATED → RESOLVED → CLOSED`

Centre sections: Activity

Right panel sections: Tasks, Attachments, Linked records

More menu: Copy link, Close incident, Cancel incident (danger)

### 9.2 Change

Additional detail fields: `Change type` (read-only), `Scheduled start` (read-only), `Due date` (read-only — the change's scheduled end; shows the date or "N/A")

Status order: `DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED → CLOSED` (plus `REJECTED`, `CANCELLED` as terminal states)

Centre sections: Implementation (inline-editable text fields: Reason, Impact assessment, Rollback plan, Implementation notes, Post-implementation review), Approvals (read-only list), Activity

Right panel sections: Tasks, Attachments, Linked records

More menu: Copy link, Cancel change (danger)

### 9.3 Service Request

Additional detail fields: none beyond standard

Status order: `NEW → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → COMPLETED → CLOSED`

Centre sections: Activity

Right panel sections: Tasks, Attachments, Linked records

More menu: Copy link, Close request, Cancel request (danger)

### 9.4 Task

Additional detail fields: `Due date` (read-only; shows the date or "N/A" when unset — always rendered)

Status order: `OPEN → IN_PROGRESS → BLOCKED → DONE`

Centre sections: Activity

Right panel sections: Attachments, Linked records (no Tasks panel)

More menu: Copy link, Mark done, Cancel task (danger)

### 9.5 Risk

Additional detail fields: `Likelihood` (editable — LOW / MEDIUM / HIGH), `Impact` (editable — LOW / MEDIUM / HIGH)

Status order: `IDENTIFIED → ASSESSED → MITIGATING → MITIGATED → ACCEPTED → CLOSED`

Centre sections: Assessment (inline-editable text fields: Mitigation plan, Acceptance note), Activity

Right panel sections: Tasks, Attachments, Linked records

More menu: Copy link, Close risk

### 9.6 Issue

Additional detail fields: `Severity` (editable — AMBER / RED)

Status order: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`

Centre sections: Activity

Right panel sections: Tasks, Attachments, Linked records

More menu: Copy link, Close issue

### 9.7 Maintenance

No additional detail fields beyond standard

Status order: `PLANNED → SCHEDULED → IN_PROGRESS → COMPLETED → CLOSED`

Centre sections: Work details (work type, notes as inline-editable), Activity

Right panel sections: Attachments, Linked records (no Tasks panel)

More menu: Copy link, Cancel maintenance (danger)

### 9.8 Check

Additional detail fields: `Check type` (read-only), `Site` (read-only), `Template` (read-only), `Reviewer` (editable)

Status order: `DRAFT → SCHEDULED → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED → CLOSED`

Centre sections: Check items (execution checklist — unique to this type, preserve exactly), Activity

Right panel sections: **Check is a custom page (NOT the shared shell)** — its non-executing "standard
layout" right column is a Properties panel + Progress card + an **Attachments** section. The Attachments
section uses the shared non-collapsible `RightPanelSection` (the same always-visible header as the shell),
matching the de-collapse of the work-item pages. No Linked-records panel.

More menu: Copy link, Cancel check (danger)

---

## 10. Task status colour map

| Status | Background | Text |
|---|---|---|
| Open | `var(--bg-secondary)` | text.secondary |
| In progress | `#e6f1fb` | `#185fa5` |
| Blocked | `#fcebeb` | `#a32d2d` |
| Done | `#eaf3de` | `#3b6d11` |

---

## 11. Linked record type badge colours

Same as type badge colours in section 3.3.

Linked record status badge: same 10px pill style as task status badges, colour driven by the linked record's own status using the status colour map in section 8.

---

## 12. Implementation order

1. ✅ `StatusPopover.tsx` — written, do not modify
2. ✅ `RecordDetailShell.tsx` — written, do not modify unless a shell-level bug is found
3. ✅ `IncidentDetailPage.tsx` — confirmed reference implementation, visually verified
4. Migrate remaining pages in order: Change, ServiceRequest, Task, Risk, Issue, Maintenance, Check
5. Each migration: read `IncidentDetailPage.tsx` as the pattern reference, read the existing page fully, preserve all queries and mutations, replace only the render layer

**The reference implementation is `IncidentDetailPage.tsx`. When in doubt about any pattern, look there first.**

---

## 13. Code rules

- Only `IncidentDetailPage.tsx` and `RecordDetailShell.tsx` modified in the first pass — no other files
- All new components: `React.memo`
- All event handlers: `useCallback`
- All derived values: `useMemo`
- Tab/filter state in `searchParams` with `replace: true`
- No new packages — MUI v5 and existing imports only
- TypeScript strict — no `any`
- `tsc --noEmit` must pass before considering any task complete
- Do not change any existing query keys, API endpoints, or mutation signatures
