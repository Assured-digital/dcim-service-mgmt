import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography
} from "@mui/material"
import EditNoteIcon from "@mui/icons-material/EditNote"
import SendOutlinedIcon from "@mui/icons-material/SendOutlined"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom"
import UndoIcon from "@mui/icons-material/Undo"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import RestartAltIcon from "@mui/icons-material/RestartAlt"
import WorkOutlineIcon from "@mui/icons-material/WorkOutline"
import ContactsOutlinedIcon from "@mui/icons-material/ContactsOutlined"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useThemeMode } from "../lib/theme"
import { useBreadcrumb } from "./Shell"
import {
  EditableTitleCard,
  RecordDetailShell,
  SectionPanel,
  useDetailNarrow,
  type CentreSection,
  type DetailField,
  type MoreMenuItem,
  type PopoverOption,
  type RecordMetadata,
  type RightSection,
  type StatusConfig,
  type StatusOption,
} from "../components/detail"
import { AssigneeCell, accentToken, statusColors, type ThemeMode } from "../components/shared"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
import { QuoteLineItemsEditor } from "../components/QuoteLineItemsEditor"
import {
  QUOTE_STATUS_LABELS, QUOTE_TRANSITIONS, contactDisplayName, createWorkPackageFromQuote, formatMoney,
  getQuote, listContacts, replaceQuoteLineItems, reviseQuote, updateQuote, type QuoteLineInput
} from "../lib/crm"

const STATUS_ICONS: Record<string, React.ReactNode> = {
  DRAFT: <EditNoteIcon sx={{ fontSize: 14 }} />,
  SENT: <SendOutlinedIcon sx={{ fontSize: 14 }} />,
  ACCEPTED: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  REJECTED: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
  EXPIRED: <HourglassBottomIcon sx={{ fontSize: 14 }} />,
  WITHDRAWN: <UndoIcon sx={{ fontSize: 14 }} />,
}

function buildStatusConfig(mode: ThemeMode): StatusConfig {
  return {
    options: Object.keys(QUOTE_STATUS_LABELS).map<StatusOption>(value => ({
      value,
      label: QUOTE_STATUS_LABELS[value],
      badgeClass: `b-${value.toLowerCase()}`,
      bg: statusColors(value, mode).bg,
      iconColor: statusColors(value, mode).text,
      icon: STATUS_ICONS[value],
      buttonIcon: STATUS_ICONS[value],
    })),
  }
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message)) return message.join(", ")
  }
  return fallback
}

export default function CrmQuoteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { setPageFullBleed } = useBreadcrumb()
  const narrow = useDetailNarrow()
  const { mode } = useThemeMode()
  const statusConfig = React.useMemo(() => buildStatusConfig(mode), [mode])
  const canWrite = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  React.useEffect(() => {
    if (narrow) return
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [narrow, setPageFullBleed])

  const [error, setError] = React.useState("")
  const [linesOpen, setLinesOpen] = React.useState(false)
  const [lines, setLines] = React.useState<QuoteLineInput[]>([])
  const attachRef = React.useRef<AttachmentsHandle>(null)

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote-detail", id],
    queryFn: () => getQuote(id!),
    enabled: !!id,
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", { forPicker: true }],
    queryFn: () => listContacts({ status: "ACTIVE" }),
  })

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["quote-detail", id] })
    qc.invalidateQueries({ queryKey: ["quotes"] })
  }, [qc, id])

  const patchMutation = useMutation({
    mutationFn: async (dto: Parameters<typeof updateQuote>[1]) => updateQuote(id!, dto),
    onSuccess: () => { setError(""); invalidate() },
    onError: (e: unknown) => setError(getApiErrorMessage(e, "Failed to update quote")),
  })

  const linesMutation = useMutation({
    mutationFn: async () => replaceQuoteLineItems(id!, lines.filter(l => l.description.trim())),
    onSuccess: () => { setLinesOpen(false); invalidate() },
    onError: (e: unknown) => setError(getApiErrorMessage(e, "Failed to save line items")),
  })

  const reviseMutation = useMutation({
    mutationFn: () => reviseQuote(id!),
    onSuccess: next => {
      notify.success(`Draft v${next.version} created`)
      invalidate()
      navigate(`/crm/quotes/${next.id}`)
    },
    onError: (e: unknown) => setError(getApiErrorMessage(e, "Failed to revise quote")),
  })

  const createWpMutation = useMutation({
    mutationFn: () => createWorkPackageFromQuote(id!),
    onSuccess: () => { notify.success("Work package created"); invalidate() },
    onError: (e: unknown) => setError(getApiErrorMessage(e, "Failed to create work package")),
  })

  const isDraft = quote?.status === "DRAFT"

  const handleStatusChange = React.useCallback((to: string) => {
    if (!quote) return
    if (!canWrite) {
      notify.error("Quote changes need a commercial role (Service Manager or admin)")
      return
    }
    const legal = QUOTE_TRANSITIONS[quote.status] ?? []
    if (!legal.includes(to)) {
      notify.error(`A ${QUOTE_STATUS_LABELS[quote.status]} quote can't move to ${QUOTE_STATUS_LABELS[to]}${quote.status === "SENT" ? "" : " — use Revise to issue a new version"}`)
      return
    }
    patchMutation.mutate({ status: to })
  }, [quote, canWrite, notify, patchMutation])

  // ── Detail fields ──────────────────────────────────────────────────────
  const contactOptions = React.useMemo<PopoverOption[]>(() => {
    const tok = accentToken("blue", mode)
    const neutral = accentToken("neutral", mode)
    return [
      { value: "", label: "None", iconBg: neutral.bg, iconColor: neutral.text, icon: <ContactsOutlinedIcon sx={{ fontSize: 14 }} /> },
      ...contacts.map(c => ({ value: c.id, label: contactDisplayName(c), iconBg: tok.bg, iconColor: tok.text, icon: <ContactsOutlinedIcon sx={{ fontSize: 14 }} /> })),
    ]
  }, [contacts, mode])

  const money = formatMoney(quote?.value, quote?.currency)

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!quote) return []
    const wrap = { width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-end", textAlign: "right", gap: 0.5 } as const
    const fields: DetailField[] = [
      {
        key: "version", label: "Version", editable: false,
        value: (
          <Box sx={wrap}>
            <Typography sx={{ fontSize: 12 }}>v{quote.version}</Typography>
            {quote.isPrimary ? <Chip size="small" label="primary" sx={{ fontSize: 10, height: 17 }} /> : null}
          </Box>
        ),
      },
      {
        key: "contactId", label: "Recipient", editable: canWrite && isDraft,
        currentValue: quote.contactId ?? "", popoverOptions: contactOptions,
        onSelect: v => patchMutation.mutateAsync({ contactId: v || undefined }).then(() => undefined),
        value: <Box sx={wrap}><Typography sx={{ fontSize: 12 }}>{quote.contact ? contactDisplayName(quote.contact) : "—"}</Typography></Box>,
      },
      {
        key: "validUntil", label: "Valid until", editable: canWrite && isDraft, editorKind: "date",
        currentValue: quote.validUntil ? quote.validUntil.slice(0, 10) : "",
        onSelect: v => patchMutation.mutateAsync({ validUntil: v ? new Date(v).toISOString() : undefined }).then(() => undefined),
        value: (
          <Box sx={wrap}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("en-GB") : "—"}
            </Typography>
          </Box>
        ),
      },
    ]
    if (quote.value !== undefined) {
      fields.unshift({
        key: "value", label: "Value", editable: false,
        value: <Box sx={wrap}><Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#1d4ed8" }}>{money ?? "—"}</Typography></Box>,
      })
    }
    return fields
  }, [quote, canWrite, isDraft, contactOptions, money, patchMutation])

  // ── Centre sections ────────────────────────────────────────────────────
  const sections = React.useMemo<CentreSection[]>(() => {
    if (!quote) return []
    const list: CentreSection[] = []

    if (quote.status === "ACCEPTED") {
      list.push({
        id: "accepted", title: "", flush: true,
        content: (
          <SectionPanel title="Accepted 🎉">
            {quote.workPackage ? (
              <Typography sx={{ fontSize: 13 }}>
                Engagement created: <b>{quote.workPackage.reference}</b> — {quote.workPackage.title}
              </Typography>
            ) : canWrite ? (
              <Button size="small" variant="contained" startIcon={<WorkOutlineIcon sx={{ fontSize: 15 }} />}
                disabled={createWpMutation.isPending}
                onClick={() => createWpMutation.mutate()}>
                Create work package from this quote
              </Button>
            ) : (
              <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>Accepted — awaiting work package creation.</Typography>
            )}
          </SectionPanel>
        ),
      })
    }

    list.push({
      id: "lines", title: "", flush: true,
      content: (
        <SectionPanel title="Line items">
          {quote.lineItems.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>No line items yet.</Typography>
          ) : (
            <Box>
              {quote.lineItems.map(l => (
                <Box key={l.id} sx={{ display: "flex", gap: 1.5, py: 0.5, borderBottom: "1px solid", borderColor: "divider", alignItems: "baseline" }}>
                  <Typography sx={{ fontSize: 13, flex: 1 }}>{l.description}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)", width: 60, textAlign: "right" }}>×{l.quantity}</Typography>
                  {l.unitPrice !== undefined ? (
                    <>
                      <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)", width: 90, textAlign: "right" }}>{formatMoney(l.unitPrice)}</Typography>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 600, width: 90, textAlign: "right" }}>{formatMoney(l.quantity * l.unitPrice)}</Typography>
                    </>
                  ) : null}
                </Box>
              ))}
              {money ? (
                <Box sx={{ display: "flex", justifyContent: "flex-end", pt: 1 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Total {money}</Typography>
                </Box>
              ) : null}
            </Box>
          )}
          {canWrite && isDraft ? (
            <Button size="small" variant="outlined" sx={{ mt: 1.5 }}
              onClick={() => {
                setLines(quote.lineItems.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice ?? 0 })))
                setLinesOpen(true)
              }}>
              Edit line items
            </Button>
          ) : null}
        </SectionPanel>
      ),
    })

    if ((quote.versions?.length ?? 0) > 1) {
      list.push({
        id: "versions", title: "", flush: true,
        content: (
          <SectionPanel title="Versions">
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {quote.versions!.map(v => (
                <Chip key={v.id} size="small"
                  label={`v${v.version} · ${QUOTE_STATUS_LABELS[v.status] ?? v.status}`}
                  onClick={v.id === quote.id ? undefined : () => navigate(`/crm/quotes/${v.id}`)}
                  sx={{ fontSize: 11, cursor: v.id === quote.id ? "default" : "pointer",
                    bgcolor: v.id === quote.id ? "rgba(29,78,216,0.12)" : "transparent",
                    border: "1px solid", borderColor: "divider" }} />
              ))}
            </Stack>
          </SectionPanel>
        ),
      })
    }

    return list
  }, [quote, canWrite, isDraft, money, createWpMutation, navigate])

  const rightSections = React.useMemo<RightSection[]>(() => [
    {
      id: "attachments",
      title: "Attachments",
      defaultOpen: true,
      headerAdd: { onClick: () => attachRef.current?.openPicker(), tooltip: "Attach file" },
      content: (
        <AttachmentsContent
          ref={attachRef}
          attachments={quote?.attachments ?? []}
          recordType="quote"
          recordId={quote?.id ?? ""}
          onChanged={invalidate}
          showAddButton={false}
        />
      ),
    },
  ], [quote, invalidate])

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!quote) return undefined
    return {
      submittedBy: <AssigneeCell user={quote.createdBy ?? null} emptyLabel="—" mode={mode} />,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    }
  }, [quote, mode])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(() => {
    const items: MoreMenuItem[] = [
      { label: "Copy link", icon: <ContentCopyIcon sx={{ fontSize: 14 }} />, onClick: () => { void navigator.clipboard?.writeText(window.location.href) } },
    ]
    if (canWrite && quote && ["SENT", "REJECTED", "EXPIRED"].includes(quote.status)) {
      items.push({
        label: `Revise (new draft v${quote.version + 1})`,
        icon: <RestartAltIcon sx={{ fontSize: 14 }} />,
        onClick: () => reviseMutation.mutate(),
      })
    }
    return items
  }, [canWrite, quote, reviseMutation])

  if (isLoading) return <LoadingState />
  if (!quote) return <ErrorState title="Quote not found" />

  return (
    <>
      {error ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="error" onClose={() => setError("")}>{error}</Alert>
        </Box>
      ) : null}

      <RecordDetailShell
        backLabel="Quotes"
        onBack={() => navigate("/crm/quotes")}
        recordRef={`${quote.reference}${quote.version > 1 ? ` v${quote.version}` : ""}`}
        typeBadge={null}
        currentStatus={quote.status}
        statusConfig={statusConfig}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <EditableTitleCard
            title={quote.title}
            description={quote.description ?? ""}
            onCommitTitle={next => (canWrite && isDraft ? patchMutation.mutateAsync({ title: next }).then(() => undefined) : Promise.reject(new Error("Only draft quotes are editable")))}
            onCommitDescription={next => (canWrite && isDraft ? patchMutation.mutateAsync({ description: next }).then(() => undefined) : Promise.reject(new Error("Only draft quotes are editable")))}
          />
        }
        sections={sections}
        detailFields={detailFields}
        metadata={metadata}
        rightSections={rightSections}
      />

      {quote.opportunity ? (
        <Box sx={{ position: "fixed", bottom: 12, right: 16, zIndex: 5 }}>
          <Chip icon={<TrendingUpIcon sx={{ fontSize: 15 }} />}
            label={`${quote.opportunity.reference} — ${quote.opportunity.title}`}
            onClick={() => navigate(`/crm/opportunities/${quote.opportunity!.id}`)}
            sx={{ fontSize: 11.5, cursor: "pointer", bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }} />
        </Box>
      ) : null}

      <Dialog open={linesOpen} onClose={() => setLinesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Edit line items</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <QuoteLineItemsEditor lines={lines} onChange={setLines} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLinesOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={linesMutation.isPending} onClick={() => linesMutation.mutate()}>
            {linesMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
