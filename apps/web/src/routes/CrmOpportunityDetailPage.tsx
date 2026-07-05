import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography
} from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import VerifiedIcon from "@mui/icons-material/Verified"
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined"
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined"
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
import PersonIcon from "@mui/icons-material/Person"
import ContactsOutlinedIcon from "@mui/icons-material/ContactsOutlined"
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import WorkOutlineIcon from "@mui/icons-material/WorkOutline"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useThemeMode } from "../lib/theme"
import { useAssignableUsers } from "../lib/useAssignableUsers"
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
  type StatusConfig,
  type StatusOption,
} from "../components/detail"
import { AssigneeCell, accentToken, statusColors, type ThemeMode } from "../components/shared"
import {
  LOST_REASONS, LOST_REASON_LABELS, OPEN_STAGES, OPPORTUNITY_STAGE_LABELS, OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS,
  contactDisplayName, createWorkPackageFromOpportunity, formatMoney, getOpportunity, isRotting, listContacts, updateOpportunity,
  type OpportunityPatch, type OpportunityView
} from "../lib/crm"
import { updateClient } from "../lib/clients"

const STAGE_ICONS: Record<string, React.ReactNode> = {
  DISCOVERY: <SearchIcon sx={{ fontSize: 14 }} />,
  QUALIFIED: <VerifiedIcon sx={{ fontSize: 14 }} />,
  PROPOSAL: <DescriptionOutlinedIcon sx={{ fontSize: 14 }} />,
  NEGOTIATION: <HandshakeOutlinedIcon sx={{ fontSize: 14 }} />,
  WON: <EmojiEventsOutlinedIcon sx={{ fontSize: 14 }} />,
  LOST: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
}

function buildStageConfig(mode: ThemeMode): StatusConfig {
  return {
    options: Object.keys(OPPORTUNITY_STAGE_LABELS).map<StatusOption>(value => ({
      value,
      label: OPPORTUNITY_STAGE_LABELS[value],
      badgeClass: `b-${value.toLowerCase()}`,
      bg: statusColors(value, mode).bg,
      iconColor: statusColors(value, mode).text,
      icon: STAGE_ICONS[value],
      buttonIcon: STAGE_ICONS[value],
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

export default function CrmOpportunityDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { setPageFullBleed } = useBreadcrumb()
  const narrow = useDetailNarrow()
  const { mode } = useThemeMode()
  const stageConfig = React.useMemo(() => buildStageConfig(mode), [mode])
  const canWrite = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])
  const isOrgSuper = hasAnyRole([...ORG_SUPER_ROLES])

  React.useEffect(() => {
    if (narrow) return
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [narrow, setPageFullBleed])

  const [error, setError] = React.useState("")
  const [lostDialogOpen, setLostDialogOpen] = React.useState(false)
  const [lostReason, setLostReason] = React.useState("")
  const [lostDetail, setLostDetail] = React.useState("")
  const [wonDialogOpen, setWonDialogOpen] = React.useState(false)
  const [figuresOpen, setFiguresOpen] = React.useState(false)
  const [figures, setFigures] = React.useState<{ value?: number; probability?: number; nextStep?: string; nextStepDate?: string }>({})

  const { data: opp, isLoading } = useQuery({
    queryKey: ["opportunity-detail", id],
    queryFn: () => getOpportunity(id!),
    enabled: !!id,
  })

  const { data: users = [] } = useAssignableUsers()
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", { forPicker: true }],
    queryFn: () => listContacts({ status: "ACTIVE" }),
  })

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["opportunity-detail", id] })
    qc.invalidateQueries({ queryKey: ["opportunities"] })
  }, [qc, id])

  const patch = React.useCallback(async (dto: OpportunityPatch) => {
    await updateOpportunity(id!, dto)
    invalidate()
  }, [id, invalidate])

  const patchMutation = useMutation({
    mutationFn: patch,
    onError: (e: unknown) => setError(getApiErrorMessage(e, "Failed to update opportunity")),
    onSuccess: () => setError(""),
  })

  // ── Stage changes ──────────────────────────────────────────────────────
  const handleStatusChange = React.useCallback((to: string) => {
    if (!opp || !canWrite) {
      if (!canWrite) notify.error("Stage changes need a commercial role (Service Manager or admin)")
      return
    }
    if (to === opp.stage) return
    if (to === "LOST") {
      setLostReason("")
      setLostDetail("")
      setLostDialogOpen(true)
      return
    }
    if (to === "WON") {
      setWonDialogOpen(true)
      return
    }
    patchMutation.mutate({ stage: to })
  }, [opp, canWrite, notify, patchMutation])

  const confirmLost = React.useCallback(() => {
    if (!lostReason) return
    patchMutation.mutate({ stage: "LOST", lostReason, lostDetail: lostDetail || undefined })
    setLostDialogOpen(false)
  }, [lostReason, lostDetail, patchMutation])

  const confirmWon = React.useCallback(() => {
    patchMutation.mutate({ stage: "WON" })
    setWonDialogOpen(false)
  }, [patchMutation])

  // ── WON follow-ons ─────────────────────────────────────────────────────
  const createWpMutation = useMutation({
    mutationFn: () => createWorkPackageFromOpportunity(id!),
    onSuccess: () => {
      notify.success("Work package created")
      invalidate()
    },
    onError: (e: unknown) => setError(getApiErrorMessage(e, "Failed to create work package")),
  })

  const onboardingMutation = useMutation({
    mutationFn: () => updateClient(opp!.clientId, { lifecycleStage: "ONBOARDING" }),
    onSuccess: () => {
      notify.success("Client moved to Onboarding")
      qc.invalidateQueries({ queryKey: ["clients"] })
      invalidate()
    },
    onError: (e: unknown) => setError(getApiErrorMessage(e, "Failed to update client stage")),
  })

  // ── Detail fields ──────────────────────────────────────────────────────
  const typeOptions = React.useMemo<PopoverOption[]>(() => {
    const tok = accentToken("blue", mode)
    return OPPORTUNITY_TYPES.map(v => ({
      value: v, label: OPPORTUNITY_TYPE_LABELS[v], iconBg: tok.bg, iconColor: tok.text,
      icon: <CategoryOutlinedIcon sx={{ fontSize: 14 }} />,
    }))
  }, [mode])

  const ownerOptions = React.useMemo<PopoverOption[]>(() => {
    const green = accentToken("green", mode)
    const neutral = accentToken("neutral", mode)
    return [
      { value: "", label: "Unassigned", iconBg: neutral.bg, iconColor: neutral.text, icon: <PersonIcon sx={{ fontSize: 14 }} /> },
      ...users.map(u => ({ value: u.id, label: u.displayName, iconBg: green.bg, iconColor: green.text, icon: <PersonIcon sx={{ fontSize: 14 }} /> })),
    ]
  }, [users, mode])

  const contactOptions = React.useMemo<PopoverOption[]>(() => {
    const tok = accentToken("blue", mode)
    const neutral = accentToken("neutral", mode)
    return [
      { value: "", label: "None", iconBg: neutral.bg, iconColor: neutral.text, icon: <ContactsOutlinedIcon sx={{ fontSize: 14 }} /> },
      ...contacts.map(c => ({ value: c.id, label: contactDisplayName(c), iconBg: tok.bg, iconColor: tok.text, icon: <ContactsOutlinedIcon sx={{ fontSize: 14 }} /> })),
    ]
  }, [contacts, mode])

  const hasValue = opp?.value !== undefined && opp?.value !== null
  const money = formatMoney(opp?.value, opp?.currency)

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!opp) return []
    const wrap = { width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-end", textAlign: "right", gap: 0.5 } as const
    const fields: DetailField[] = [
      {
        key: "type", label: "Type", editable: canWrite,
        currentValue: opp.type, popoverOptions: typeOptions,
        onSelect: v => patch({ type: v }),
        value: <Box sx={wrap}><Typography sx={{ fontSize: 12 }}>{OPPORTUNITY_TYPE_LABELS[opp.type] ?? opp.type}</Typography></Box>,
      },
      {
        key: "ownerId", label: "Owner", editable: canWrite,
        currentValue: opp.ownerId ?? "", popoverOptions: ownerOptions,
        onSelect: v => patch({ ownerId: v || undefined }),
        value: <Box sx={wrap}><AssigneeCell user={opp.owner ? { displayName: opp.owner.displayName ?? "—" } : null} /></Box>,
      },
      {
        key: "contactId", label: "Contact", editable: canWrite,
        currentValue: opp.contactId ?? "", popoverOptions: contactOptions,
        onSelect: v => patch({ contactId: v || undefined }),
        value: <Box sx={wrap}><Typography sx={{ fontSize: 12 }}>{opp.contact ? contactDisplayName(opp.contact) : "—"}</Typography></Box>,
      },
      {
        key: "expectedCloseDate", label: "Expected close", editable: canWrite, editorKind: "date",
        currentValue: opp.expectedCloseDate ? opp.expectedCloseDate.slice(0, 10) : "",
        onSelect: v => patch({ expectedCloseDate: v ? new Date(v).toISOString() : undefined }),
        value: (
          <Box sx={wrap}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString("en-GB") : "—"}
            </Typography>
          </Box>
        ),
      },
    ]
    if (hasValue || canWrite) {
      fields.splice(1, 0, {
        key: "value", label: "Value", editable: false,
        value: (
          <Box sx={wrap}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#1d4ed8" }}>{money ?? "—"}</Typography>
            {opp.probability !== undefined && opp.probability !== null ? (
              <Chip size="small" label={`${opp.probability}%`} sx={{ fontSize: 10.5, height: 18 }} />
            ) : null}
          </Box>
        ),
      })
    }
    return fields
  }, [opp, canWrite, typeOptions, ownerOptions, contactOptions, money, hasValue, patch])

  // ── Centre sections ────────────────────────────────────────────────────
  const sections = React.useMemo<CentreSection[]>(() => {
    if (!opp) return []
    const list: CentreSection[] = []

    if (opp.stage === "WON") {
      list.push({
        id: "won", title: "", flush: true,
        content: (
          <SectionPanel title="Won 🎉">
            {opp.workPackage ? (
              <Typography sx={{ fontSize: 13 }}>
                Engagement created: <b>{opp.workPackage.reference}</b> — {opp.workPackage.title}
              </Typography>
            ) : canWrite ? (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button size="small" variant="contained" startIcon={<WorkOutlineIcon sx={{ fontSize: 15 }} />}
                  disabled={createWpMutation.isPending}
                  onClick={() => createWpMutation.mutate()}>
                  Create work package from this deal
                </Button>
                {opp.client?.lifecycleStage === "PROSPECT" && isOrgSuper ? (
                  <Button size="small" variant="outlined" disabled={onboardingMutation.isPending}
                    onClick={() => onboardingMutation.mutate()}>
                    Move {opp.client.name} to Onboarding
                  </Button>
                ) : null}
              </Stack>
            ) : (
              <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>Won — awaiting work package creation.</Typography>
            )}
          </SectionPanel>
        ),
      })
    }

    if (opp.stage === "LOST") {
      list.push({
        id: "lost", title: "", flush: true,
        content: (
          <SectionPanel title="Lost">
            <Typography sx={{ fontSize: 13 }}>
              Reason: <b>{opp.lostReason ? LOST_REASON_LABELS[opp.lostReason] ?? opp.lostReason : "—"}</b>
              {opp.lostDetail ? ` — ${opp.lostDetail}` : ""}
            </Typography>
          </SectionPanel>
        ),
      })
    }

    list.push({
      id: "deal", title: "", flush: true,
      content: (
        <SectionPanel title="Next step">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 13, flex: 1, minWidth: 200 }}>
              {opp.nextStep ? opp.nextStep : <i style={{ opacity: 0.6 }}>No next step set — a deal with no next step is stalled by definition.</i>}
              {opp.nextStepDate ? (
                <Typography component="span" sx={{ fontSize: 12, color: new Date(opp.nextStepDate) < new Date() ? "#dc2626" : "var(--color-text-muted)", ml: 0.75 }}>
                  by {new Date(opp.nextStepDate).toLocaleDateString("en-GB")}
                </Typography>
              ) : null}
            </Typography>
            {isRotting(opp) ? <Chip size="small" label="stalled" sx={{ fontSize: 10.5, height: 20, bgcolor: "rgba(220,38,38,0.1)", color: "#dc2626" }} /> : null}
            {canWrite ? (
              <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 14 }} />}
                onClick={() => {
                  setFigures({
                    value: opp.value ?? undefined,
                    probability: opp.probability ?? undefined,
                    nextStep: opp.nextStep ?? undefined,
                    nextStepDate: opp.nextStepDate ?? undefined,
                  })
                  setFiguresOpen(true)
                }}>
                Edit deal
              </Button>
            ) : null}
          </Box>
          {opp.renewsWorkPackage ? (
            <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)", mt: 1 }}>
              Renews {opp.renewsWorkPackage.reference} — {opp.renewsWorkPackage.title}
            </Typography>
          ) : null}
        </SectionPanel>
      ),
    })

    return list
  }, [opp, canWrite, isOrgSuper, createWpMutation, onboardingMutation])

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!opp) return undefined
    return {
      submittedBy: <AssigneeCell user={opp.createdBy ?? null} emptyLabel="—" mode={mode} />,
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
    }
  }, [opp, mode])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(() => [
    {
      label: "Copy link",
      icon: <ContentCopyIcon sx={{ fontSize: 14 }} />,
      onClick: () => { void navigator.clipboard?.writeText(window.location.href) },
    },
  ], [])

  if (isLoading) return <LoadingState />
  if (!opp) return <ErrorState title="Opportunity not found" />

  return (
    <>
      {error ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="error" onClose={() => setError("")}>{error}</Alert>
        </Box>
      ) : null}

      <RecordDetailShell
        backLabel="Pipeline"
        onBack={() => navigate("/crm/pipeline")}
        recordRef={opp.reference}
        typeBadge={null}
        currentStatus={opp.stage}
        statusConfig={stageConfig}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <EditableTitleCard
            title={opp.title}
            description={opp.notes ?? ""}
            onCommitTitle={next => (canWrite ? patch({ title: next }) : Promise.reject(new Error("No permission")))}
            onCommitDescription={next => (canWrite ? patch({ notes: next }) : Promise.reject(new Error("No permission")))}
          />
        }
        sections={sections}
        detailFields={detailFields}
        metadata={metadata}
      />

      {/* LOST — required reason picklist (never free-text-only) */}
      <Dialog open={lostDialogOpen} onClose={() => setLostDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Mark as lost</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField select label="Reason" value={lostReason} onChange={e => setLostReason(e.target.value)}
              required fullWidth InputLabelProps={{ shrink: true }}>
              {LOST_REASONS.map(r => <MenuItem key={r} value={r}>{LOST_REASON_LABELS[r]}</MenuItem>)}
            </TextField>
            <TextField label="Detail (optional)" value={lostDetail} onChange={e => setLostDetail(e.target.value)}
              fullWidth multiline minRows={2} InputLabelProps={{ shrink: true }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLostDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={!lostReason} onClick={confirmLost}>Mark lost</Button>
        </DialogActions>
      </Dialog>

      {/* WON — confirmation; the create-WP + onboarding actions appear on the Won panel after */}
      <Dialog open={wonDialogOpen} onClose={() => setWonDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Mark as won?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5 }}>
            This closes the deal. You'll then be offered "create work package"
            {opp.client?.lifecycleStage === "PROSPECT" ? ` and moving ${opp.client.name} to Onboarding` : ""}.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setWonDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmWon}>Mark won</Button>
        </DialogActions>
      </Dialog>

      {/* Edit deal figures (value/probability/next step) */}
      <Dialog open={figuresOpen} onClose={() => setFiguresOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Edit deal</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Value (£)" type="number" value={figures.value ?? ""}
              onChange={e => setFigures(f => ({ ...f, value: e.target.value === "" ? undefined : Number(e.target.value) }))}
              fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="Probability (%)" type="number" value={figures.probability ?? ""}
              onChange={e => setFigures(f => ({ ...f, probability: e.target.value === "" ? undefined : Number(e.target.value) }))}
              fullWidth InputLabelProps={{ shrink: true }}
              helperText="Re-defaults from the stage on every stage change" />
            <TextField label="Next step" value={figures.nextStep ?? ""}
              onChange={e => setFigures(f => ({ ...f, nextStep: e.target.value || undefined }))}
              fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="Next step by" type="date"
              value={figures.nextStepDate ? figures.nextStepDate.slice(0, 10) : ""}
              onChange={e => setFigures(f => ({ ...f, nextStepDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
              fullWidth InputLabelProps={{ shrink: true }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFiguresOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => { patchMutation.mutate(figures); setFiguresOpen(false) }}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
