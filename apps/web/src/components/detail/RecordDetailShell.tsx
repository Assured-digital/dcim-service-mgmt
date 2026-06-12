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
import { useNavigate } from "react-router-dom"
import { StatusPopover, type PopoverOption } from "./StatusPopover"
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
  popoverOptions?: PopoverOption[]
  currentValue?: string
  onSelect?: (value: string) => void
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
  // When set, a Jira-style "+" icon button is rendered right-aligned on the
  // section header row (next to the title) and fires onClick — replacing the
  // old text add-button that lived below the section content.
  headerAdd?: { onClick: () => void; tooltip: string; disabled?: boolean }
  content: React.ReactNode
}

export interface RecordMetadata {
  submittedBy?: string | null
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
  loading?: boolean
  error?: string
}

const STATUS_BUTTON_ID = "record-status"
const MORE_MENU_ID = "record-more-menu"
const DETAIL_FIELD_PREFIX = "detail-field-"

// Centre association ordering: Linked records → Tasks → Attachments. Incoming
// rightSections (any order) are sorted by this; unknown ids fall to the end.
const CENTRE_ASSOC_ORDER = ["linked", "tasks", "attachments"]

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
          variant="caption"
          fontWeight={500}
          sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
        >
          {icon ? (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                fontSize: 12,
                color: "var(--color-text-tertiary)",
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

// Jira-style "+" add affordance for an association section header. Rendered into
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
            color: "var(--color-text-tertiary)",
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

// Jira-style container: a subtle bordered panel with a header + thin divider and
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
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{title}</Typography>
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
}

const DetailFieldRow = React.memo(function DetailFieldRow({
  field,
  popoverOpen,
  onOpenPopover,
  onClosePopover,
}: DetailFieldRowProps) {
  const anchorRef = React.useRef<HTMLDivElement | null>(null)
  const popoverId = `${DETAIL_FIELD_PREFIX}${field.key}`
  const interactive = field.editable && !!field.popoverOptions && !!field.onSelect

  const handleClick = React.useCallback(() => {
    if (!interactive) return
    if (anchorRef.current) onOpenPopover(popoverId, anchorRef.current)
  }, [interactive, onOpenPopover, popoverId])

  const handleSelect = React.useCallback(
    (value: string) => {
      if (field.onSelect) field.onSelect(value)
    },
    [field]
  )

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
          cursor: interactive ? "pointer" : "default",
          "&:hover": interactive ? { bgcolor: "action.hover" } : {},
        }}
      >
        <Typography
          sx={{ width: 80, fontSize: 12, color: "text.secondary", flexShrink: 0 }}
        >
          {field.label}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: 12 }}>{field.value}</Box>
      </Box>
      {field.popoverOptions && field.onSelect ? (
        <StatusPopover
          id={popoverId}
          header={field.label}
          options={field.popoverOptions}
          currentValue={field.currentValue ?? ""}
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
        <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
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

  // Associations now live in the CENTRE column (Jira layout). Reorder to
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
  // appended after the record's own overflow actions. On the main page it's just the
  // record's own items.
  const effectiveMoreItems = React.useMemo<MoreMenuItem[]>(() => {
    const base = moreMenuItems ?? []
    if (narrow && chrome) {
      return [
        ...base,
        { label: "Open full", icon: <OpenInFullIcon sx={{ fontSize: 16 }} />, onClick: chrome.onOpenFull },
      ]
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

  // Drawer-header form: status pill + overflow sit adjacent.
  const statusCluster = (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      {statusButton}
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
                sx={{ display: "flex", justifyContent: "space-between", py: 0.375, px: 0.75 }}
              >
                <Typography variant="caption" color="text.disabled">
                  {row.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>
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
