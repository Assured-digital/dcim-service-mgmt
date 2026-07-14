import React from "react"
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Divider,
  IconButton,
  Paper,
  Popper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material"
import { createPortal } from "react-dom"
import AddIcon from "@mui/icons-material/Add"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import MoreHorizIcon from "@mui/icons-material/MoreHoriz"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import OpenInFullIcon from "@mui/icons-material/OpenInFull"
import LinkOffIcon from "@mui/icons-material/LinkOff"
import { useNavigate } from "react-router-dom"
import { StatusPopover, type PopoverOption } from "./StatusPopover"
import { DueDatePopover } from "./DueDatePopover"
import { WatchToggle } from "./WatchToggle"
import type { WatchRecordType } from "../../lib/watch"
import { useNotification } from "../NotificationProvider"
import { useBreadcrumb } from "../../routes/Shell"
import { useInDrillDownNavigator } from "../shared/layout/DrillDownNavigator"
import { useDetailNarrow, useDetailDrawerChrome } from "./detailLayoutContext"
import { PRODUCT_NAME } from "../../lib/usePageTitle"

export interface StatusOption {
  value: string
  label: string
  badgeClass: string
  bg: string
  iconColor: string
  icon: React.ReactNode
  buttonIcon: React.ReactNode
}

export interface StatusConfig {
  options: StatusOption[]
}

export interface MoreMenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}

export interface DetailField {
  key: string
  label: string
  value: React.ReactNode
  editable: boolean
  // Which editor opens on click. "options" (default) → the StatusPopover option list
  // (needs popoverOptions); "date" → the shared DueDatePopover (no popoverOptions).
  // Both stage into the same batch-confirm model.
  editorKind?: "options" | "date"
  popoverOptions?: PopoverOption[]
  currentValue?: string
  // Commits the chosen value. Returning a promise lets the shell await the commit
  // (pending-confirm): a resolve shows a success toast and clears the pending state;
  // a reject shows an error toast and keeps the value pending so the user can retry.
  // For a date field the value is a YYYY-MM-DD string, or "" to clear the date.
  onSelect?: (value: string) => void | Promise<void>
}

export interface CentreSection {
  id: string
  title: string
  headerExtra?: React.ReactNode
  content: React.ReactNode
  flush?: boolean
}

export interface RightSection {
  id: string
  title: string
  defaultOpen?: boolean
  // When set, a "+" icon button is rendered right-aligned on the
  // section header row (next to the title) and fires onClick — replacing the
  // old text add-button that lived below the section content.
  headerAdd?: { onClick: () => void; tooltip: string; disabled?: boolean }
  content: React.ReactNode
}

export interface RecordMetadata {
  // ReactNode (not just string) so pages can render the creator via the shared
  // AssigneeCell (avatar + name), matching the Assignee row and the list/comments.
  submittedBy?: React.ReactNode
  createdAt: string
  updatedAt: string
}

export interface RecordDetailShellProps {
  backLabel?: string
  onBack?: () => void
  recordRef: string
  typeBadge: React.ReactNode
  currentStatus: string
  statusConfig: StatusConfig
  onStatusChange: (to: string, dialogData?: Record<string, string>) => void
  moreMenuItems?: MoreMenuItem[]
  titleCard: React.ReactNode
  sections: CentreSection[]
  detailFields: DetailField[]
  metadata?: RecordMetadata
  rightSections?: RightSection[]
  // When set, a Jira-style Watch toggle renders in the right-column header row (and
  // the drawer status cluster). Only the six watchable work-item types pass this.
  watchTarget?: { recordType: WatchRecordType; recordId: string }
  loading?: boolean
  error?: string
}

const STATUS_BUTTON_ID = "record-status"
const MORE_MENU_ID = "record-more-menu"
const DETAIL_FIELD_PREFIX = "detail-field-"

// Centre association ordering: Linked records → Tasks → Attachments. Incoming
// rightSections (any order) are sorted by this; unknown ids fall to the end.
const CENTRE_ASSOC_ORDER = ["linked", "tasks", "attachments"]

// One section-header token: 0.75rem / 600 / text.primary. Collapses the three former
// header variants (SectionPanel 600, CentreSection 500, RightPanelSection caption/muted)
// so every panel header — Details, Activity, Linked records, Tasks, Attachments,
// Description — renders identically. 12px = the caption rem-size (no new size).
const SECTION_HEADER_SX = { fontSize: 12, fontWeight: 600, color: "text.primary" } as const

interface RightPanelSectionProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}

// Always-visible right-column section: a header (no chevron/toggle) + body.
// Sections size to their content; the right column scrolls if tall.
export const RightPanelSection = React.memo(function RightPanelSection({
  title,
  icon,
  children,
}: RightPanelSectionProps) {
  return (
    <Box sx={{ borderBottom: "0.5px solid", borderColor: "divider" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1.75,
          py: 1.25,
        }}
      >
        <Typography
          sx={{ ...SECTION_HEADER_SX, display: "flex", alignItems: "center", gap: 0.75 }}
        >
          {icon ? (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                fontSize: 12,
                color: "text.tertiary",
              }}
            >
              {icon}
            </Box>
          ) : null}
          {title}
        </Typography>
      </Box>
      <Box sx={{ px: 1.75, pb: 1.5 }}>{children}</Box>
    </Box>
  )
})

// Right-aligned "+" add affordance for an association section header. Rendered into
// SectionPanel.headerExtra so every association panel reads consistently on both
// the main detail page and the narrow drawer.
const SectionAddButton = React.memo(function SectionAddButton({
  onClick,
  tooltip,
  disabled,
}: {
  onClick: () => void
  tooltip: string
  disabled?: boolean
}) {
  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          aria-label={tooltip}
          sx={{
            borderRadius: 1,
            p: 0.5,
            color: "text.tertiary",
            transition: "background-color 0.12s, color 0.12s",
            "&:hover": {
              bgcolor: "action.selected",
              color: "text.primary",
            },
          }}
        >
          <AddIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </span>
    </Tooltip>
  )
})

interface SectionPanelProps {
  title?: string
  headerExtra?: React.ReactNode
  children: React.ReactNode
}

// Bordered container: a subtle bordered panel with a header + thin divider and
// a squarer corner (the global shape.borderRadius token). Used for both the centre
// association sections (Linked records / Tasks / Attachments) and the right-column
// Details panel, so they read consistently. Omit `title` for a header-less panel.
export const SectionPanel = React.memo(function SectionPanel({
  title,
  headerExtra,
  children,
}: SectionPanelProps) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.paper",
        mb: 2,
        overflow: "hidden",
      }}
    >
      {title !== undefined ? (
        <>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1.75, py: 1.25 }}
          >
            <Typography sx={SECTION_HEADER_SX}>{title}</Typography>
            {headerExtra ? <Box>{headerExtra}</Box> : null}
          </Stack>
          <Divider sx={{ borderColor: "divider" }} />
        </>
      ) : null}
      <Box sx={{ px: 1.75, py: 1.5 }}>{children}</Box>
    </Box>
  )
})

interface DetailFieldRowProps {
  field: DetailField
  popoverOpen: boolean
  onOpenPopover: (id: string, anchor: HTMLElement) => void
  onClosePopover: () => void
  // Batch pending-confirm: the staged value for this field (null = not dirty), a
  // callback to stage a popover selection, and whether a batch commit is in flight.
  pendingValue: string | null
  onStage: (key: string, value: string) => void
  committing: boolean
}

const DetailFieldRow = React.memo(function DetailFieldRow({
  field,
  popoverOpen,
  onOpenPopover,
  onClosePopover,
  pendingValue,
  onStage,
  committing,
}: DetailFieldRowProps) {
  const anchorRef = React.useRef<HTMLDivElement | null>(null)
  const popoverId = `${DETAIL_FIELD_PREFIX}${field.key}`
  const isDate = field.editorKind === "date"
  // A date field is interactive via onSelect + the DueDatePopover (no popoverOptions);
  // an option field needs popoverOptions. Both still require editable + onSelect.
  const interactive = field.editable && !!field.onSelect && (isDate || !!field.popoverOptions)
  const isPending = pendingValue !== null

  const handleClick = React.useCallback(() => {
    if (!interactive || committing) return
    // While pending, re-opening the popover lets the user change the staged value
    // (the popover shows the staged value as selected).
    if (anchorRef.current) onOpenPopover(popoverId, anchorRef.current)
  }, [interactive, committing, onOpenPopover, popoverId])

  // Popover select stages the value in the batch model. The parent owns the
  // dirty-check: re-selecting the committed value is a no-op and never stages,
  // and changing back to the original drops the field out of pending.
  const handleSelect = React.useCallback(
    (value: string) => onStage(field.key, value),
    [onStage, field.key]
  )

  // The date popover yields string | null (null = clear). The batch model is string-
  // keyed, so a cleared date stages as "" — matching an empty currentValue, so the
  // dirty-check treats clearing an already-empty date as a no-op.
  const handleSelectDate = React.useCallback(
    (value: string | null) => onStage(field.key, value ?? ""),
    [onStage, field.key]
  )

  const pendingOption = isPending
    ? field.popoverOptions?.find((o) => o.value === pendingValue)
    : undefined

  // Date fields have no option chip; show the staged date (or "Cleared" when emptied).
  const pendingDisplay = isDate
    ? pendingValue || "Cleared"
    : pendingOption?.label ?? pendingValue

  return (
    <>
      <Box
        ref={anchorRef}
        onClick={handleClick}
        sx={{
          display: "flex",
          alignItems: "center",
          px: 0.75,
          py: 0.5,
          borderRadius: 1,
          cursor: interactive && !committing ? "pointer" : "default",
          "&:hover": interactive && !isPending ? { bgcolor: "action.hover" } : {},
        }}
      >
        <Typography
          sx={{ width: 80, fontSize: 12, color: "text.secondary", flexShrink: 0 }}
        >
          {field.label}
        </Typography>
        {isPending ? (
          // Staged (unsaved) value — dashed primary border marks it pending. No
          // per-field ✓/✗: the batch Confirm/Cancel bar at the panel foot owns the commit.
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                minWidth: 0,
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                border: "1px dashed",
                borderColor: "primary.main",
                bgcolor: pendingOption?.iconBg ?? "action.hover",
              }}
            >
              <Typography
                noWrap
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: pendingOption?.iconColor ?? "text.secondary",
                }}
              >
                {pendingDisplay}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ flex: 1, minWidth: 0, fontSize: 12 }}>{field.value}</Box>
        )}
      </Box>
      {isDate && field.onSelect ? (
        <DueDatePopover
          anchorEl={anchorRef.current}
          open={popoverOpen}
          onClose={onClosePopover}
          current={pendingValue ?? field.currentValue ?? null}
          onSelect={handleSelectDate}
          headerLabel={field.label}
        />
      ) : field.popoverOptions && field.onSelect ? (
        <StatusPopover
          id={popoverId}
          header={field.label}
          options={field.popoverOptions}
          currentValue={pendingValue ?? field.currentValue ?? ""}
          onSelect={handleSelect}
          anchorEl={anchorRef.current}
          open={popoverOpen}
          onClose={onClosePopover}
        />
      ) : null}
    </>
  )
})

interface CentreSectionViewProps {
  section: CentreSection
}

const CentreSectionView = React.memo(function CentreSectionView({
  section,
}: CentreSectionViewProps) {
  if (section.flush) {
    return <Box>{section.content}</Box>
  }
  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography sx={SECTION_HEADER_SX}>
          {section.title}
        </Typography>
        {section.headerExtra ? <Box>{section.headerExtra}</Box> : null}
      </Stack>
      <Box>{section.content}</Box>
    </Box>
  )
})

function formatMetadataDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${date}, ${time}`
}

function RecordDetailShellImpl({
  backLabel = "Back",
  onBack,
  recordRef,
  // typeBadge prop retained for API compatibility but no longer rendered — the type
  // now reads from each page's own "Type" detailField (no duplicate chip).
  currentStatus,
  statusConfig,
  onStatusChange,
  moreMenuItems,
  titleCard,
  sections,
  detailFields,
  metadata,
  rightSections,
  watchTarget,
  loading,
  error,
}: RecordDetailShellProps) {
  const navigate = useNavigate()
  const { setPrimaryRecordLabel } = useBreadcrumb()
  // Inside the drill-down navigator the rail header is the back path, so the
  // shell's own Back button is redundant — hide it. Standalone detail routes
  // (no navigator) keep it.
  const inNavigator = useInDrillDownNavigator()
  // Inside the narrow association-peek drawer the shell stacks to a single column
  // and drops its redundant inner top row (Back / ref / type) — the drawer's own
  // chrome provides those. The main page never sets this, so it is unaffected.
  const narrow = useDetailNarrow()
  // In the drawer the navigator publishes a header slot (for the status cluster) +
  // an "Open full" action; null on the main page.
  const chrome = useDetailDrawerChrome()

  // The breadcrumb shows the URL's PRIMARY record only. The drawer (narrow) renders
  // the same shell over the main ticket — it must NOT write the breadcrumb or the tab
  // title, else it would overwrite the main ticket's. So only the non-narrow instance
  // owns the primary record label (set on mount, cleared on unmount).
  React.useEffect(() => {
    if (narrow) return
    setPrimaryRecordLabel(recordRef)
    document.title = `${recordRef} · ${PRODUCT_NAME}`
    return () => {
      setPrimaryRecordLabel("")
      document.title = PRODUCT_NAME
    }
  }, [recordRef, narrow, setPrimaryRecordLabel])

  const [openPopoverId, setOpenPopoverId] = React.useState<string | null>(null)
  const [popoverAnchor, setPopoverAnchor] = React.useState<HTMLElement | null>(null)

  const openPopover = React.useCallback((id: string, anchor: HTMLElement) => {
    setOpenPopoverId(id)
    setPopoverAnchor(anchor)
  }, [])

  const closePopover = React.useCallback(() => {
    setOpenPopoverId(null)
    setPopoverAnchor(null)
  }, [])

  // ── Batch pending-confirm for editable Details fields ──────────────────────
  // A field stages here only when its selected value DIFFERS from the committed
  // value (a no-op selection never stages; changing back to the original drops it
  // out). The bottom Confirm/Cancel bar shows whenever the map is non-empty: Cancel
  // just clears it (committed values live on the fields, so rows snap back), Confirm
  // fires each field's own save with honest partial-on-failure.
  const { notify } = useNotification()
  const [pendingChanges, setPendingChanges] = React.useState<Record<string, string>>({})
  const [committingBatch, setCommittingBatch] = React.useState(false)

  // Drawer / drill-down reuse this shell across records — never leak staged edits.
  React.useEffect(() => {
    setPendingChanges({})
  }, [recordRef])

  const detailFieldByKey = React.useMemo(() => {
    const m: Record<string, DetailField> = {}
    for (const f of detailFields) m[f.key] = f
    return m
  }, [detailFields])

  const handleStageChange = React.useCallback(
    (key: string, value: string) => {
      const committed = detailFieldByKey[key]?.currentValue ?? ""
      setPendingChanges((prev) => {
        const next = { ...prev }
        if (value === committed) delete next[key] // no-op / changed-back → not dirty
        else next[key] = value
        return next
      })
    },
    [detailFieldByKey]
  )

  const handleBatchCancel = React.useCallback(() => setPendingChanges({}), [])

  const handleBatchConfirm = React.useCallback(async () => {
    const entries = Object.entries(pendingChanges)
    if (entries.length === 0) return
    setCommittingBatch(true)
    const succeededKeys: string[] = []
    const succeededLabels: string[] = []
    const failedLabels: string[] = []
    // Honest partial-on-failure: fire each field's own save in turn; a field that
    // saves clears, a field that throws stays pending so the user can retry it.
    for (const [key, value] of entries) {
      const field = detailFieldByKey[key]
      if (!field?.onSelect) {
        succeededKeys.push(key)
        continue
      }
      try {
        await field.onSelect(value)
        succeededKeys.push(key)
        succeededLabels.push(field.label)
      } catch {
        failedLabels.push(field.label)
      }
    }
    setPendingChanges((prev) => {
      const next = { ...prev }
      for (const key of succeededKeys) delete next[key]
      return next
    })
    setCommittingBatch(false)
    if (succeededLabels.length === 1) notify.success(`${succeededLabels[0]} updated`)
    else if (succeededLabels.length > 1) notify.success("Changes saved")
    for (const label of failedLabels) notify.error(`Couldn't save ${label.toLowerCase()}`)
  }, [pendingChanges, detailFieldByKey, notify])

  // Shell-level Escape: when changes are pending and NO popover is open, Escape
  // discards all staged edits. If a StatusPopover/menu is open it owns Escape (it
  // closes itself); openPopoverId is still set at this keydown, so we stand down and
  // a second Escape (popover now closed) does the discard.
  React.useEffect(() => {
    if (Object.keys(pendingChanges).length === 0 || committingBatch) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && openPopoverId === null) setPendingChanges({})
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pendingChanges, committingBatch, openPopoverId])

  const handleBack = React.useCallback(() => {
    if (onBack) onBack()
    else navigate(-1)
  }, [onBack, navigate])

  const statusButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const moreButtonRef = React.useRef<HTMLButtonElement | null>(null)

  const handleStatusButtonClick = React.useCallback(() => {
    if (!statusButtonRef.current) return
    if (openPopoverId === STATUS_BUTTON_ID) closePopover()
    else openPopover(STATUS_BUTTON_ID, statusButtonRef.current)
  }, [openPopoverId, openPopover, closePopover])

  const handleMoreClick = React.useCallback(() => {
    if (!moreButtonRef.current) return
    if (openPopoverId === MORE_MENU_ID) closePopover()
    else openPopover(MORE_MENU_ID, moreButtonRef.current)
  }, [openPopoverId, openPopover, closePopover])

  const handleStatusSelect = React.useCallback(
    (value: string) => {
      onStatusChange(value)
    },
    [onStatusChange]
  )

  const handleMoreClickAway = React.useCallback(() => {
    if (openPopoverId === MORE_MENU_ID) closePopover()
  }, [openPopoverId, closePopover])

  const currentStatusOption = React.useMemo(
    () => statusConfig.options.find((opt) => opt.value === currentStatus),
    [statusConfig, currentStatus]
  )

  // Associations now live in the CENTRE column. Reorder to
  // Linked records → Tasks → Attachments regardless of the prop order.
  const orderedAssociations = React.useMemo(() => {
    const rank = (id: string) => {
      const i = CENTRE_ASSOC_ORDER.indexOf(id)
      return i === -1 ? CENTRE_ASSOC_ORDER.length : i
    }
    return [...(rightSections ?? [])].sort((a, b) => rank(a.id) - rank(b.id))
  }, [rightSections])

  const statusPopoverOptions = React.useMemo<PopoverOption[]>(
    () =>
      statusConfig.options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        iconBg: opt.bg,
        icon: opt.icon,
        iconColor: opt.iconColor,
      })),
    [statusConfig]
  )

  const moreMenuItem = React.useCallback(
    (item: MoreMenuItem, idx: number) => {
      const handleClick = () => {
        item.onClick()
        closePopover()
      }
      return (
        <Box
          key={`${item.label}-${idx}`}
          onClick={handleClick}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 0.75,
            borderRadius: 1,
            cursor: "pointer",
            color: item.danger ? "error.main" : "text.primary",
            "&:hover": {
              bgcolor: item.danger ? "rgba(211, 47, 47, 0.08)" : "action.hover",
            },
          }}
        >
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: 14,
              color: "inherit",
            }}
          >
            {item.icon}
          </Box>
          <Typography sx={{ fontSize: 13, color: "inherit" }}>{item.label}</Typography>
        </Box>
      )
    },
    [closePopover]
  )

  const statusBg = currentStatusOption?.bg ?? "action.hover"
  const statusFg = currentStatusOption?.iconColor ?? "text.secondary"
  const statusLabel = currentStatusOption?.label ?? currentStatus

  const popperModifiers = React.useMemo(
    () => [{ name: "offset", options: { offset: [0, 4] } }],
    []
  )

  // In the drawer, "Open full" is an overflow-menu item (not a standalone button),
  // appended after the record's own overflow actions; "Remove link" follows it (only
  // when the drawer was opened from a linked-record row — chrome.onRemoveLink set),
  // last and danger-styled as the destructive action. On the main page it's just the
  // record's own items.
  const effectiveMoreItems = React.useMemo<MoreMenuItem[]>(() => {
    const base = moreMenuItems ?? []
    if (narrow && chrome) {
      const items: MoreMenuItem[] = [
        ...base,
        { label: "Open full", icon: <OpenInFullIcon sx={{ fontSize: 16 }} />, onClick: chrome.onOpenFull },
      ]
      if (chrome.onRemoveLink) {
        items.push({
          label: "Remove link",
          icon: <LinkOffIcon sx={{ fontSize: 16 }} />,
          onClick: chrome.onRemoveLink,
          danger: true,
        })
      }
      return items
    }
    return base
  }, [moreMenuItems, narrow, chrome])

  if (loading) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress size={28} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  // ── Reusable fragments ─────────────────────────────────────────────────────
  // The single status control (status button + overflow). Rendered at the top of
  // the right column on the main page, or portaled into the drawer header (narrow).
  // The StatusPopover + overflow Popper live in the shell body and anchor by ref, so
  // they follow the buttons across the portal.
  // The status pill and the "…" overflow are separate fragments so the wide
  // right-column row can right-align the overflow while the drawer header keeps
  // them adjacent. Only one of the two layouts mounts at a time (narrow → portal,
  // wide → right column), so the shared refs anchor their popovers correctly.
  const statusButton = (
    <Button
      ref={statusButtonRef}
      onClick={handleStatusButtonClick}
      size="small"
      disableElevation
      sx={{
        bgcolor: statusBg,
        color: statusFg,
        textTransform: "none",
        fontSize: 12,
        fontWeight: 500,
        px: 1.25,
        py: 0.375,
        minWidth: 148,
        gap: 0.5,
        "&:hover": { bgcolor: statusBg, filter: "brightness(0.97)" },
      }}
      startIcon={
        currentStatusOption ? (
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", fontSize: 14, color: statusFg }}
          >
            {currentStatusOption.buttonIcon}
          </Box>
        ) : undefined
      }
      endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
    >
      {statusLabel}
    </Button>
  )

  const moreButton =
    effectiveMoreItems.length > 0 ? (
      <IconButton ref={moreButtonRef} size="small" onClick={handleMoreClick}>
        <MoreHorizIcon sx={{ fontSize: 18 }} />
      </IconButton>
    ) : null

  const watchToggle = watchTarget ? (
    <WatchToggle recordType={watchTarget.recordType} recordId={watchTarget.recordId} />
  ) : null

  // Drawer-header form: status pill + watch + overflow sit adjacent.
  const statusCluster = (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      {statusButton}
      {watchToggle}
      {moreButton}
    </Stack>
  )

  // Details panel — Reference (relocated from the removed top bar) then the editable
  // detail fields (Type, Client, Priority, Assignee, …) and record metadata. Type is
  // NOT relocated here: each page already supplies its own "Type" detailField, so a
  // relocated chip would duplicate it.
  const detailsPanel = (
    <SectionPanel title="Details">
      <Box sx={{ display: "flex", alignItems: "center", px: 0.75, py: 0.5 }}>
        <Typography sx={{ width: 80, fontSize: 12, color: "text.secondary", flexShrink: 0 }}>
          Reference
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: "monospace", textAlign: "right" }}>{recordRef}</Box>
      </Box>
      {detailFields.map((field) => (
        <DetailFieldRow
          key={field.key}
          field={field}
          popoverOpen={openPopoverId === `${DETAIL_FIELD_PREFIX}${field.key}`}
          onOpenPopover={openPopover}
          onClosePopover={closePopover}
          pendingValue={pendingChanges[field.key] ?? null}
          onStage={handleStageChange}
          committing={committingBatch}
        />
      ))}
      {metadata ? (
        <>
          <Divider sx={{ my: 1 }} />
          <Box>
            {[
              { label: "Submitted by", value: metadata.submittedBy ?? "—" },
              { label: "Created", value: formatMetadataDate(metadata.createdAt) },
              { label: "Updated", value: formatMetadataDate(metadata.updatedAt) },
            ].map((row) => (
              <Box
                key={row.label}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  py: 0.375,
                  px: 0.75,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {row.label}
                </Typography>
                <Typography variant="caption" color="text.primary">
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      ) : null}
      {Object.keys(pendingChanges).length > 0 ? (
        <>
          <Divider sx={{ my: 1 }} />
          <Stack
            direction="row"
            spacing={1}
            justifyContent="flex-end"
            sx={{ px: 0.75, pt: 0.5 }}
          >
            <Button
              size="small"
              onClick={handleBatchCancel}
              disabled={committingBatch}
              sx={{ textTransform: "none", fontSize: 12, color: "text.secondary" }}
            >
              Discard
            </Button>
            <Button
              size="small"
              variant="contained"
              disableElevation
              onClick={handleBatchConfirm}
              disabled={committingBatch}
              startIcon={
                committingBatch ? <CircularProgress size={12} color="inherit" /> : undefined
              }
              sx={{ textTransform: "none", fontSize: 12 }}
            >
              Save changes
            </Button>
          </Stack>
        </>
      ) : null}
    </SectionPanel>
  )

  // Associations (Linked / Tasks / Attachments) + narrative sections (Activity …).
  const centreNarrative = (
    <>
      {orderedAssociations.map((section) => (
        <SectionPanel
          key={section.id}
          title={section.title}
          headerExtra={section.headerAdd ? <SectionAddButton {...section.headerAdd} /> : undefined}
        >
          {section.content}
        </SectionPanel>
      ))}
      {sections.map((section) => (
        <CentreSectionView key={section.id} section={section} />
      ))}
    </>
  )

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {/* Body. No top bar (removed): on the main page the status cluster sits at the
          top of the right column and reference/type live in the Details panel; in the
          drawer the status cluster is portaled into the drawer header. */}
      {narrow ? (
        // Single scrolling column: Subject → Description → Details → associations →
        // Activity. Status cluster portals into the drawer header.
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 3 }}>
          <Box>{titleCard}</Box>
          {detailsPanel}
          {centreNarrative}
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}>
          {/* Centre column. pt: 2 (not 3) so the Subject panel top lines up with
              the right column's status cluster (the right column uses p: 2). */}
          <Box sx={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", p: 3, pt: 2 }}>
            <Box>{titleCard}</Box>
            {centreNarrative}
          </Box>

          {/* Right column — status cluster (top) + Details panel */}
          <Box
            sx={{
              width: 300,
              flexShrink: 0,
              height: "100%",
              overflowY: "auto",
              borderLeft: "0.5px solid",
              borderColor: "divider",
              bgcolor: "background.default",
              p: 2,
            }}
          >
            {/* Status pill far-left; the overflow "…" right-aligns to the panel
                edge. The standalone Back affordance (non-navigator routes only)
                sits just left of the overflow. */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              {statusButton}
              <Stack direction="row" alignItems="center" spacing={0.75}>
                {watchToggle}
                {!inNavigator ? (
                  <IconButton
                    size="small"
                    onClick={handleBack}
                    aria-label={backLabel}
                  >
                    <ArrowBackIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                ) : null}
                {moreButton}
              </Stack>
            </Stack>
            {detailsPanel}
          </Box>
        </Box>
      )}

      {/* Drawer header status cluster (narrow): portaled into the navigator's slot. */}
      {narrow && chrome?.headerSlot ? createPortal(statusCluster, chrome.headerSlot) : null}

      {/* Status popover (anchored to status button) */}
      <StatusPopover
        id={STATUS_BUTTON_ID}
        header="Status"
        options={statusPopoverOptions}
        currentValue={currentStatus}
        onSelect={handleStatusSelect}
        anchorEl={popoverAnchor}
        open={openPopoverId === STATUS_BUTTON_ID}
        onClose={closePopover}
      />

      {/* More menu popover */}
      {effectiveMoreItems.length > 0 ? (
        <Popper
          open={openPopoverId === MORE_MENU_ID}
          anchorEl={popoverAnchor}
          placement="bottom-end"
          modifiers={popperModifiers}
          sx={{ zIndex: (theme) => theme.zIndex.modal }}
        >
          <ClickAwayListener onClickAway={handleMoreClickAway}>
            <Paper
              elevation={3}
              sx={{
                border: "0.5px solid",
                borderColor: "divider",
                borderRadius: "10px",
                padding: "6px",
                minWidth: 200,
              }}
            >
              {effectiveMoreItems.map((item, idx) => moreMenuItem(item, idx))}
            </Paper>
          </ClickAwayListener>
        </Popper>
      ) : null}
    </Box>
  )
}

export const RecordDetailShell = React.memo(RecordDetailShellImpl)
