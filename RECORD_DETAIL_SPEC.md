# Record Detail Page — Implementation Spec
## AD Service Management Platform

This document is the single source of truth for all record detail pages in the platform. Every detail page — Incident, Change, Service Request, Task, Risk, Issue, Maintenance, Check — uses the same `RecordDetailShell` component and the same interaction patterns. Only the field configuration and status lifecycle differ per type.

Read this entire document before writing any code.

---

## 1. Architecture

### 1.1 Shell component

All detail pages render `RecordDetailShell` as their root element. The shell owns:

- The top bar (back button, ref pill, type badge, status button, ... menu)
- The two-column layout (scrollable centre, fixed right panel)
- The `StatusPopover` component (shared, reusable)
- Global click-outside handling to close any open popover

The shell accepts these props:

```ts
interface RecordDetailShellProps {
  // Top bar
  backLabel?: string                    // defaults to "Back"
  onBack?: () => void                   // defaults to navigate(-1)
  recordRef: string                     // e.g. "IN-2026-6620"
  typeBadge: React.ReactNode            // coloured badge chip e.g. "INC"
  currentStatus: string                 // e.g. "INVESTIGATING"
  statusConfig: StatusConfig            // defines all statuses and their appearance
  onStatusChange: (to: string, dialogData?: Record<string, string>) => void
  moreMenuItems?: MoreMenuItem[]        // items for the ... dropdown

  // Centre column slots
  titleCard: React.ReactNode            // always present
  sections: CentreSection[]            // ordered list of sections to render

  // Right panel slots
  detailFields: DetailField[]           // renders in Details collapsible panel
  rightSections?: RightSection[]        // additional collapsible panels below Details

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

```
┌─ Top bar (full width, 44px) ─────────────────────────────────────────────┐
│  ← Back   REF-PILL   TYPE-BADGE         [Status▾]  [...]                │
├─────────────────────────────────────────┬────────────────────────────────┤
│  CENTRE (flex:1, scrollable)            │  RIGHT (264px, scrollable)     │
│                                         │                                │
│  Subject                                │  ▾ Details                     │
│  [Title]                                │    Type       Incident         │
│  Description                            │    Severity   MEDIUM ▾         │
│  [Description text]                     │    Priority   Medium ▾         │
│  ─ divider ─                            │    Assignee   Unassigned ▾     │
│  ▾ Tasks                                │    ───────────────────         │
│  [task rows]                            │    Submitted by  —             │
│  ─ divider ─                            │    Created    29 Apr, 11:36    │
│  ▾ Activity   11 events                 │    Updated    29 Apr, 20:52    │
│  [feed]                                 │                                │
│                                         │  ▾ Attachments                 │
│                                         │    file.pcap                   │
│                                         │    + Attach file               │
│                                         │                                │
│                                         │  ▾ Linked records              │
│                                         │    [record rows]               │
│                                         │    + Link record               │
└─────────────────────────────────────────┴────────────────────────────────┘
```

- Centre column: `flex: 1`, `overflow-y: auto`, `padding: 20px 24px`
- Right panel: `width: 264px`, `flex-shrink: 0`, `border-left`, `overflow-y: auto`
- No left panel — the previous three-column layout is retired
- The shell sets `display: flex; height: 100%` on the body container

---

## 3. Top bar

### 3.1 Back button
- Outlined small button, arrow left icon + `backLabel` text
- `onClick`: calls `onBack` prop or `navigate(-1)`
- MUI: `Button variant="outlined" size="small" startIcon={<ArrowBackIcon />}`

### 3.2 Ref pill
- Monospace font, secondary background, subtle border
- `Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', border: '0.5px solid', borderColor: 'divider', px: 1, py: 0.25, borderRadius: 1 }}`

### 3.3 Type badge
- Composed by the page — passed as `typeBadge` prop
- Each type has a fixed colour:

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

### 3.4 Status button
- Coloured pill button — background and text match the current status colour from `statusConfig`
- Left icon (status-specific SVG), label text, right chevron icon
- On click: opens `StatusPopover` — same popover component as field popovers
- On status change: calls `onStatusChange(to)`

### 3.5 ... menu button
- Square icon button, `MoreHorizIcon`
- Opens a popover with `moreMenuItems`
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

### 5.2 Centre sections

Each section is a `Box sx={{ mb: 2.5 }}` with a collapsible header and a `Divider` above it (except the first section directly after the title block).

**Dividers between sections:**
- `Divider sx={{ borderColor: 'divider', opacity: 0.6, my: 2 }}` between the description block and the first section, and between each subsequent section

**Collapsible section header pattern** — used for Tasks and Activity:
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
- Sentence case — "Tasks" not "TASKS", "Activity" not "ACTIVITY"
- No icon next to the label — chevron only
- `variant="caption"`, `fontWeight={500}`, `color="text.secondary"`
- Chevron rotates -90° when collapsed, animates with `transition: transform .15s`

Wrap section body in `{open && <Box>...</Box>}`. Default open for all sections.

The event count for Activity (`11 events`) sits in the header row right-aligned using a spacer: `<Box sx={{ flex: 1 }} />` then `<Typography variant="caption" color="text.tertiary">{count} events</Typography>`. Visible even when collapsed.

Sections are defined by the page. Standard section types:

#### Tasks section

Each task row: `Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.875, mb: 0.5, borderRadius: 1 }}`

Row contents (left to right):
- Ref: monospace 11px muted (`TSK-001`)
- Title: `flex: 1`, 12px
- Status badge: plain coloured badge, no chevron, clickable — opens `StatusPopover`

Status badge style (same as Linked Records status):
- `fontSize: 10px, fontWeight: 500, px: 1, py: 0.25, borderRadius: 1`
- Background and text from task status colour map (see section 7)

"Add task" button: `Button variant="text" size="small" startIcon={<AddIcon />}` below the list

#### Linked records section

Each linked record row: `Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.875, mb: 0.5, borderRadius: 1, cursor: 'pointer' }}`

Row contents:
- Type badge: 10px coloured badge (from type colour map)
- Title: `flex: 1`, 12px, `overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap`
- Status badge: 10px coloured badge (same style as task status badge)

"Link record" button below the list.

If no linked entities: `Typography variant="caption" color="text.tertiary"` — "No linked records"

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

### 7.1 Collapsible section pattern

Each right panel section uses this pattern:

```tsx
<Box sx={{ borderBottom: '0.5px solid', borderColor: 'divider' }}>
  {/* Header — clickable to collapse */}
  <Box onClick={toggle} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.75, py: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
    <Typography variant="caption" fontWeight={500} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <SectionIcon sx={{ fontSize: 12, color: 'text.tertiary' }} />
      {title}
    </Typography>
    <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.tertiary', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
  </Box>
  {/* Body */}
  {open && <Box sx={{ px: 1.75, pb: 1.5 }}>{children}</Box>}
</Box>
```

### 7.2 Details panel

Always the first panel. Default open.

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

### 7.4 Linked records panel

Collapsible section, default open. Sits below Attachments in the right panel. **Linked records do not appear in the centre column** — they live exclusively here.

Each linked record row — same style as attachment rows:
```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.625,
           borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
  {/* Coloured icon box — 26×26px, borderRadius: 1 */}
  {/* rp-info: name (12px) above, ref (10px muted) below */}
  {/* Status badge — 10px coloured pill, right-aligned, flex-shrink: 0 */}
</Box>
```

Icon and colour per `linkedEntityType`:

| Type | Icon | Background | Icon colour |
|---|---|---|---|
| `risk` | `WarningAmberIcon` | `#faeeda` | `#854f0b` |
| `change` | `BuildIcon` | `#e6f1fb` | `#185fa5` |
| `asset` | `StorageIcon` | `#e6f1fb` | `#185fa5` |
| `site` | `LocationOnIcon` | `#eaf3de` | `#3b6d11` |
| `issue` | `ErrorOutlineIcon` | `#fbeaf0` | `#993556` |
| default | `LinkIcon` | `action.hover` | `text.tertiary` |

If no linked entities: `Typography variant="caption" color="text.tertiary"` — "No linked records"

"Link record" `Button variant="text" size="small" startIcon={<AddIcon />}` always shown below.

### 7.5 Breadcrumb

The shell calls `useBreadcrumb().setRecordLabel(recordRef)` on mount and clears it on unmount via `useEffect`. This produces the breadcrumb trail: `Client › Module › Record ref`. Import `useBreadcrumb` from the same path used in `Shell.tsx`.

Each attachment row: `Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.625, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}`

- File type icon box: 26×26px, `bgcolor: action.hover`, `borderRadius: 1`
  - `ImageIcon` for image types, `DescriptionIcon` for everything else
- File name: 12px + size + date in 10px muted below
- Download icon: `FileDownloadIcon`, 12px, muted, right-aligned

"Attach file" button: `Button variant="text" size="small" startIcon={<AttachFileIcon />}`

If no attachments: render nothing (not even the button — the section still shows but body is empty)

All attachments wiring: `// TODO: wire attachments API` — scaffold only for now.

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

### 9.1 Incident

Additional detail fields: `Severity` (editable, options: CRITICAL / HIGH / MEDIUM / LOW)

Status order: `NEW → INVESTIGATING → MITIGATED → RESOLVED → CLOSED`

Centre sections: Tasks, Activity

Right panel sections: Details, Attachments, Linked records

More menu: Copy link, Close incident, Cancel incident (danger)

### 9.2 Change

Additional detail fields: `Change type` (read-only), `Scheduled start` (read-only), `Scheduled end` (read-only)

Status order: `DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED → CLOSED` (plus `REJECTED`, `CANCELLED` as terminal states)

Centre sections: Implementation (inline-editable text fields: Reason, Impact assessment, Rollback plan, Implementation notes, Post-implementation review), Approvals (read-only list), Activity

Right panel sections: Details, Attachments, Linked records

More menu: Copy link, Cancel change (danger)

### 9.3 Service Request

Additional detail fields: none beyond standard

Status order: `NEW → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → COMPLETED → CLOSED`

Centre sections: Tasks, Activity

Right panel sections: Details, Attachments, Linked records

More menu: Copy link, Close request, Cancel request (danger)

### 9.4 Task

Additional detail fields: `Due date` (read-only for now)

Status order: `OPEN → IN_PROGRESS → BLOCKED → DONE`

Centre sections: Activity

Right panel sections: Details, Attachments, Linked records

More menu: Copy link, Mark done, Cancel task (danger)

### 9.5 Risk

Additional detail fields: `Likelihood` (editable — LOW / MEDIUM / HIGH), `Impact` (editable — LOW / MEDIUM / HIGH)

Status order: `IDENTIFIED → ASSESSED → MITIGATING → MITIGATED → ACCEPTED → CLOSED`

Centre sections: Assessment (inline-editable text fields: Mitigation plan, Acceptance note), Activity

Right panel sections: Details, Attachments, Linked records

More menu: Copy link, Close risk

### 9.6 Issue

Additional detail fields: `Severity` (editable — AMBER / RED)

Status order: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`

Centre sections: Activity

Right panel sections: Details, Attachments, Linked records

More menu: Copy link, Close issue

### 9.7 Maintenance

No additional detail fields beyond standard

Status order: `PLANNED → SCHEDULED → IN_PROGRESS → COMPLETED → CLOSED`

Centre sections: Work details (work type, notes as inline-editable), Activity

Right panel sections: Details, Attachments, Linked records

More menu: Copy link, Cancel maintenance (danger)

### 9.8 Check

Additional detail fields: `Check type` (read-only), `Site` (read-only), `Template` (read-only), `Reviewer` (editable)

Status order: `DRAFT → SCHEDULED → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED → CLOSED`

Centre sections: Check items (execution checklist — unique to this type, preserve exactly), Activity

Right panel sections: Details, Attachments, Linked records

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
