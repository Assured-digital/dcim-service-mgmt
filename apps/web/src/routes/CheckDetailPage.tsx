import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, MenuItem, Stack, Tab, Tabs,
  TextField, Tooltip, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import CheckIcon from "@mui/icons-material/Check"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import AddIcon from "@mui/icons-material/Add"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import {
  InfoField, Badge, DetailHeader, PropertiesPanel, chipSx
} from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type CheckItem = {
  id: string
  label: string
  section: string | null
  guidance: string | null
  responseType: string
  isRequired: boolean
  isCritical: boolean
  isAdHoc: boolean
  response: string | null
  notes: string | null
  sortOrder: number
  followOns: { id: string; entityType: string; entityId: string; note: string | null }[]
}

type Check = {
  id: string
  reference: string
  title: string
  checkType: string
  status: string
  priority: string
  passRate: number | null
  scheduledAt: string | null
  startedAt: string | null
  submittedAt: string | null
  completedAt: string | null
  scopeNotes: string | null
  engineerSummary: string | null
  reviewerNotes: string | null
  cancellationReason: string | null
  createdAt: string
  updatedAt: string
  site: { id: string; name: string }
  assignee: { id: string; email: string } | null
  reviewer: { id: string; email: string } | null
  template: { id: string; name: string; checkType: string; estimatedMinutes: number | null }
  items: CheckItem[]
}

const STATUS_ALL = ["DRAFT", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"]

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  PENDING_REVIEW: "Pending review",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  DRAFT: "Created, not yet scheduled",
  SCHEDULED: "Date confirmed, awaiting assignment",
  ASSIGNED: "Engineer assigned and notified",
  IN_PROGRESS: "Engineer actively executing",
  PENDING_REVIEW: "Submitted, awaiting manager review",
  COMPLETED: "Reviewed and signed off"
}

function responseSx(response: string | null) {
  if (response === "PASS") return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 700 }
  if (response === "FAIL") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 700 }
  if (response === "NA") return { bgcolor: "#f1f5f9", color: "#64748b", fontWeight: 700 }
  return null
}

function FollowOnModal({
  open, onClose, checkId, item, onSuccess
}: {
  open: boolean
  onClose: () => void
  checkId: string
  item: CheckItem
  onSuccess: () => void
}) {
  const [type, setType] = React.useState<"Task" | "Risk" | "Issue">("Task")
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")
  const [severity, setSeverity] = React.useState("AMBER")
  const [likelihood, setLikelihood] = React.useState("MEDIUM")
  const [impact, setImpact] = React.useState("MEDIUM")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setTitle(item.label)
      setDescription("")
      setType("Task")
      setError("")
    }
  }, [open, item.label])

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true)
    setError("")
    try {
      await api.post(`/checks/${checkId}/items/${item.id}/follow-ons`, {
        entityType: type,
        title,
        description: description || undefined,
        priority: type === "Task" ? priority : undefined,
        severity: type === "Issue" ? severity : undefined,
        likelihood: type === "Risk" ? likelihood : undefined,
        impact: type === "Risk" ? impact : undefined
      })
      onClose()
      onSuccess()
    } catch (e: any) {
      setError(e?.message ?? "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create follow-on action</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fef2f2", border: "1px solid #fecaca" }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <WarningAmberIcon sx={{ fontSize: 14, color: "#b91c1c" }} />
              <Typography variant="caption" color="#b91c1c" fontWeight={600}>
                Failed: {item.label}
              </Typography>
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            {(["Task", "Risk", "Issue"] as const).map((t) => (
              <Button key={t} size="small"
                variant={type === t ? "contained" : "outlined"}
                onClick={() => setType(t)} sx={{ flex: 1 }}>
                {t}
              </Button>
            ))}
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="Title" value={title}
            onChange={(e) => setTitle(e.target.value)} required fullWidth />
          <TextField label="Description" value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline rows={2} fullWidth />
          {type === "Task" ? (
            <TextField select label="Priority" value={priority}
              onChange={(e) => setPriority(e.target.value)} fullWidth>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </TextField>
          ) : null}
          {type === "Risk" ? (
            <Stack direction="row" spacing={1.5}>
              <TextField select label="Likelihood" value={likelihood}
                onChange={(e) => setLikelihood(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
              </TextField>
              <TextField select label="Impact" value={impact}
                onChange={(e) => setImpact(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
              </TextField>
            </Stack>
          ) : null}
          {type === "Issue" ? (
            <TextField select label="Severity" value={severity}
              onChange={(e) => setSeverity(e.target.value)} fullWidth>
              <MenuItem value="GREEN">Green — low</MenuItem>
              <MenuItem value="AMBER">Amber — medium</MenuItem>
              <MenuItem value="RED">Red — high</MenuItem>
            </TextField>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate}
          disabled={saving || !title.trim()}>
          {saving ? "Creating..." : `Create ${type.toLowerCase()}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function CheckDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])
  const canExecute = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const [activeTab, setActiveTab] = React.useState(0)
  const [error, setError] = React.useState("")
  const [transitioning, setTransitioning] = React.useState(false)

  // Item responses
  const [drafts, setDrafts] = React.useState<Record<string, { response: string; notes: string }>>({})
  const [savingItem, setSavingItem] = React.useState<string | null>(null)

  // Follow-on modal
  const [followOnItem, setFollowOnItem] = React.useState<CheckItem | null>(null)

  // Submit dialog
  const [submitOpen, setSubmitOpen] = React.useState(false)
  const [engineerSummary, setEngineerSummary] = React.useState("")

  // Review dialog
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [reviewAction, setReviewAction] = React.useState<"approve" | "return">("approve")
  const [reviewerNotes, setReviewerNotes] = React.useState("")

  // Cancel dialog
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancellationReason, setCancellationReason] = React.useState("")

  // Ad hoc item
  const [adHocOpen, setAdHocOpen] = React.useState(false)
  const [adHocLabel, setAdHocLabel] = React.useState("")
  const [adHocSection, setAdHocSection] = React.useState("")

  const { data: check, isLoading } = useQuery({
    queryKey: ["check-detail", id],
    queryFn: async () => (await api.get<Check>(`/checks/${id}`)).data,
    enabled: !!id
  })

  function getDraft(item: CheckItem) {
    return {
      response: drafts[item.id]?.response ?? item.response ?? "",
      notes: drafts[item.id]?.notes ?? item.notes ?? ""
    }
  }

  async function handleStart() {
    setTransitioning(true)
    setError("")
    try {
      await api.post(`/checks/${id}/start`)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to start")
    } finally {
      setTransitioning(false)
    }
  }

  async function handleSaveItem(item: CheckItem) {
    const draft = getDraft(item)
    setSavingItem(item.id)
    try {
      await api.post(`/checks/${id}/items/${item.id}`, {
        response: draft.response || undefined,
        notes: draft.notes || undefined
      })
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
    } finally {
      setSavingItem(null)
    }
  }

  async function handleSubmit() {
    setTransitioning(true)
    setError("")
    try {
      await api.post(`/checks/${id}/submit`, {
        engineerSummary: engineerSummary || undefined
      })
      setSubmitOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Failed to submit")
    } finally {
      setTransitioning(false)
    }
  }

  async function handleReview() {
    setTransitioning(true)
    setError("")
    try {
      const endpoint = reviewAction === "approve" ? "approve" : "return"
      await api.post(`/checks/${id}/${endpoint}`, {
        reviewerNotes: reviewerNotes || undefined
      })
      setReviewOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed")
    } finally {
      setTransitioning(false)
    }
  }

  async function handleCancel() {
    if (!cancellationReason.trim()) return
    setTransitioning(true)
    try {
      await api.post(`/checks/${id}/cancel`, { cancellationReason })
      setCancelOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } finally {
      setTransitioning(false)
    }
  }

  async function handleAddAdHoc() {
    if (!adHocLabel.trim()) return
    try {
      await api.post(`/checks/${id}/items`, {
        label: adHocLabel,
        section: adHocSection || undefined
      })
      setAdHocLabel(""); setAdHocSection("")
      setAdHocOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to add item")
    }
  }

  if (isLoading) return <LoadingState />
  if (!check) return <ErrorState title="Check not found" />

  const currentIndex = STATUS_ALL.indexOf(check.status)
  const totalItems = check.items.length
  const answeredItems = check.items.filter(i => i.response !== null).length
  const failedItems = check.items.filter(i => i.response === "FAIL")
  const allRequiredAnswered = check.items
    .filter(i => i.isRequired)
    .every(i => i.response !== null)

  const canStart = ["DRAFT", "SCHEDULED", "ASSIGNED"].includes(check.status) && canExecute
  const canSubmit = check.status === "IN_PROGRESS" && allRequiredAnswered && canExecute
  const canReview = check.status === "PENDING_REVIEW" && canManage
  const canCancel = !["COMPLETED", "CLOSED", "CANCELLED"].includes(check.status) && canManage
  const isExecuting = check.status === "IN_PROGRESS"

  // Group items by section
  const sections: Record<string, CheckItem[]> = {}
  check.items.forEach(item => {
    const key = item.section ?? "General"
    if (!sections[key]) sections[key] = []
    sections[key].push(item)
  })

  return (
    <Box>
      {/* Top bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/checks")}
            sx={{ color: "text.secondary" }} size="small"
          >
            Back to engineering checks
          </Button>
          <DetailHeader
            reference={check.reference}
            status={check.status}
            statusLabel={STATUS_LABELS[check.status]}
            extras={totalItems > 0 ? (
              <Typography sx={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                {answeredItems}/{totalItems} items
              </Typography>
            ) : undefined}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          {canStart ? (
            <Button variant="contained" size="small"
              onClick={handleStart} disabled={transitioning}>
              Start check
            </Button>
          ) : null}
          {canSubmit ? (
            <Button variant="contained" size="small"
              onClick={() => setSubmitOpen(true)}>
              Submit for review
            </Button>
          ) : null}
          {canReview ? (
            <>
              <Button variant="outlined" size="small"
                onClick={() => { setReviewAction("return"); setReviewOpen(true) }}>
                Return for rework
              </Button>
              <Button variant="contained" size="small"
                onClick={() => { setReviewAction("approve"); setReviewOpen(true) }}>
                Approve
              </Button>
            </>
          ) : null}
          {canCancel ? (
            <Button size="small" color="error" variant="outlined"
              onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {/* Info container */}
      <Box sx={{
        bgcolor: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderTopLeftRadius: 8, borderTopRightRadius: 8,
        p: 2.5
      }}>
        <InfoField label="ENGINEERING CHECK">
          <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            {check.title}
          </Typography>
        </InfoField>
        <Divider sx={{ my: 1.5 }} />
        <Stack direction="row" spacing={4}>
          <InfoField label="TYPE">
            <Typography variant="body2" color="text.secondary">{check.checkType}</Typography>
          </InfoField>
          <InfoField label="SITE">
            <Typography variant="body2" color="text.secondary">{check.site.name}</Typography>
          </InfoField>
          {check.scheduledAt ? (
            <InfoField label="SCHEDULED">
              <Typography variant="body2" color="text.secondary">
                {new Date(check.scheduledAt).toLocaleDateString("en-GB")}
              </Typography>
            </InfoField>
          ) : null}
          {check.scopeNotes ? (
            <InfoField label="SCOPE NOTES">
              <Typography variant="body2" color="text.secondary">{check.scopeNotes}</Typography>
            </InfoField>
          ) : null}
        </Stack>
        <Divider sx={{ mt: 1.5 }} />
      </Box>

      {/* Workflow strip */}
      <Box sx={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderTop: "none",
        borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
        bgcolor: "var(--color-background-primary)",
        px: 2.5, pt: 1.5, pb: 2, mb: 3
      }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
          <Typography sx={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
            color: "var(--color-text-tertiary)"
          }}>
            STATUS
          </Typography>
          <Tooltip
            title="Use the action buttons above to transition this check through its lifecycle."
            placement="right" arrow
          >
            <InfoOutlinedIcon sx={{ fontSize: 13, color: "var(--color-text-tertiary)", cursor: "help" }} />
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={0} alignItems="stretch">
          {STATUS_ALL.map((status, idx) => {
            const isCurrent = status === check.status
            const isPast = idx < currentIndex
            return (
              <React.Fragment key={status}>
                <Tooltip title={STATUS_DESCRIPTIONS[status]} placement="bottom" arrow>
                  <Box sx={{
                    flex: 1, px: 1.25, py: 1.25, borderRadius: 1.5,
                    bgcolor: isCurrent ? "#0f172a" : isPast ? "#f1f5f9" : "transparent",
                    border: "1px solid",
                    borderColor: isCurrent ? "#0f172a"
                      : isPast ? "var(--color-border-tertiary)"
                      : "transparent"
                  }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {isCurrent ? (
                        <Box sx={{
                          width: 14, height: 14, borderRadius: "50%", bgcolor: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                        }}>
                          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#0f172a" }} />
                        </Box>
                      ) : isPast ? (
                        <Box sx={{
                          width: 14, height: 14, borderRadius: "50%", bgcolor: "#cbd5e1",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                        }}>
                          <CheckIcon sx={{ fontSize: 10, color: "#fff" }} />
                        </Box>
                      ) : (
                        <Box sx={{
                          width: 14, height: 14, borderRadius: "50%",
                          border: "1.5px solid #e2e8f0", flexShrink: 0
                        }} />
                      )}
                      <Typography sx={{
                        fontSize: 11, fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? "#fff" : isPast ? "#94a3b8" : "var(--color-text-tertiary)"
                      }}>
                        {STATUS_LABELS[status]}
                      </Typography>
                    </Stack>
                  </Box>
                </Tooltip>
                {idx < STATUS_ALL.length - 1 ? (
                  <Box sx={{
                    width: 16, display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0
                  }}>
                    <Box sx={{ width: 10, height: 1, bgcolor: "var(--color-border-tertiary)" }} />
                  </Box>
                ) : null}
              </React.Fragment>
            )
          })}
        </Stack>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 260px" },
        gap: 3, alignItems: "start"
      }}>

        {/* Left — checklist */}
        <Card sx={{ alignSelf: "start" }}>
          <Box sx={{ borderBottom: "1px solid #e2e8f0" }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{ px: 2, minHeight: 44 }}
              textColor="inherit"
              TabIndicatorProps={{ style: { backgroundColor: "#0f172a" } }}
            >
              <Tab label="Checklist"
                icon={<Badge count={totalItems} />}
                iconPosition="end"
                sx={{ fontSize: 13, minHeight: 44 }} />
              {failedItems.length > 0 ? (
                <Tab label="Failed items"
                  icon={<Badge count={failedItems.length} />}
                  iconPosition="end"
                  sx={{ fontSize: 13, minHeight: 44 }} />
              ) : null}
              {check.engineerSummary || check.reviewerNotes ? (
                <Tab label="Summary" sx={{ fontSize: 13, minHeight: 44 }} />
              ) : null}
            </Tabs>
          </Box>
          <CardContent>

            {activeTab === 0 ? (
              <Stack spacing={2}>
                {/* Add ad-hoc item button */}
                {isExecuting && canExecute ? (
                  <Stack direction="row" justifyContent="flex-end">
                    <Button size="small" startIcon={<AddIcon />}
                      onClick={() => setAdHocOpen(true)}>
                      Add item
                    </Button>
                  </Stack>
                ) : null}

                {totalItems === 0 ? (
                  <Box sx={{
                    py: 3, textAlign: "center",
                    border: "1px dashed var(--color-border-tertiary)",
                    borderRadius: 1.5
                  }}>
                    <Typography variant="body2" color="text.secondary">
                      No checklist items. This check was created without a template.
                    </Typography>
                  </Box>
                ) : (
                  Object.entries(sections).map(([sectionName, items]) => (
                    <Box key={sectionName}>
                      {Object.keys(sections).length > 1 ? (
                        <Typography sx={{
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                          color: "var(--color-text-tertiary)", mb: 1, mt: 0.5
                        }}>
                          {sectionName.toUpperCase()} — {items.filter(i => i.response !== null).length}/{items.length}
                        </Typography>
                      ) : null}
                      <Stack spacing={1}>
                        {items.map((item, idx) => {
                          const draft = getDraft(item)
                          const isFail = draft.response === "FAIL"
                          const isDirty = draft.response !== (item.response ?? "") ||
                            draft.notes !== (item.notes ?? "")
                          const savedResponse = item.response
                          return (
                            <Box key={item.id} sx={{
                              p: 1.5, borderRadius: 1.5,
                              border: "0.5px solid",
                              borderColor: isFail ? "#fecaca"
                                : savedResponse === "PASS" ? "#bbf7d0"
                                : "var(--color-border-tertiary)",
                              bgcolor: isFail ? "#fff5f5"
                                : savedResponse === "PASS" ? "#f0fdf4"
                                : "var(--color-background-secondary)"
                            }}>
                              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                <Typography sx={{
                                  fontSize: 11, fontWeight: 600,
                                  color: "var(--color-text-tertiary)",
                                  mt: 0.5, flexShrink: 0, minWidth: 20
                                }}>
                                  {idx + 1}.
                                </Typography>
                                <Box sx={{ flex: 1 }}>
                                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                                    <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
                                      {item.label}
                                    </Typography>
                                    {item.isCritical ? (
                                      <Chip size="small" label="Critical"
                                        sx={{ bgcolor: "#fef2f2", color: "#b91c1c", fontSize: 10, height: 18 }} />
                                    ) : null}
                                    {item.isAdHoc ? (
                                      <Chip size="small" label="Ad hoc"
                                        sx={{ bgcolor: "#f0f9ff", color: "#0369a1", fontSize: 10, height: 18 }} />
                                    ) : null}
                                    {savedResponse ? (
                                      <Chip size="small" sx={{ ...responseSx(savedResponse), height: 20, fontSize: 10 }}
                                        label={savedResponse} />
                                    ) : null}
                                  </Stack>
                                  {item.guidance ? (
                                    <Typography variant="caption" color="text.secondary"
                                      sx={{ display: "block", mb: 0.75, fontStyle: "italic" }}>
                                      {item.guidance}
                                    </Typography>
                                  ) : null}
                                  {isExecuting && canExecute ? (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      {item.responseType === "PASS_FAIL" ? (
                                        <>
                                          <Button size="small"
                                            variant={draft.response === "PASS" ? "contained" : "outlined"}
                                            color="success"
                                            onClick={() => setDrafts(prev => ({
                                              ...prev,
                                              [item.id]: { ...getDraft(item), response: "PASS" }
                                            }))}>
                                            Pass
                                          </Button>
                                          <Button size="small"
                                            variant={draft.response === "FAIL" ? "contained" : "outlined"}
                                            color="error"
                                            onClick={() => setDrafts(prev => ({
                                              ...prev,
                                              [item.id]: { ...getDraft(item), response: "FAIL" }
                                            }))}>
                                            Fail
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Button size="small"
                                            variant={draft.response === "PASS" ? "contained" : "outlined"}
                                            color="success"
                                            onClick={() => setDrafts(prev => ({
                                              ...prev,
                                              [item.id]: { ...getDraft(item), response: "PASS" }
                                            }))}>
                                            Pass
                                          </Button>
                                          <Button size="small"
                                            variant={draft.response === "FAIL" ? "contained" : "outlined"}
                                            color="error"
                                            onClick={() => setDrafts(prev => ({
                                              ...prev,
                                              [item.id]: { ...getDraft(item), response: "FAIL" }
                                            }))}>
                                            Fail
                                          </Button>
                                          <Button size="small"
                                            variant={draft.response === "NA" ? "contained" : "outlined"}
                                            onClick={() => setDrafts(prev => ({
                                              ...prev,
                                              [item.id]: { ...getDraft(item), response: "NA" }
                                            }))}
                                            sx={{ color: draft.response === "NA" ? "#fff" : "#64748b" }}>
                                            N/A
                                          </Button>
                                        </>
                                      )}
                                      <TextField size="small" sx={{ flex: 1 }}
                                        value={draft.notes}
                                        onChange={(e) => setDrafts(prev => ({
                                          ...prev,
                                          [item.id]: { ...getDraft(item), notes: e.target.value }
                                        }))}
                                        placeholder="Notes (optional)" />
                                      <Button size="small" variant="outlined"
                                        onClick={() => handleSaveItem(item)}
                                        disabled={!isDirty || savingItem === item.id}>
                                        {savingItem === item.id ? "..." : "Save"}
                                      </Button>
                                    </Stack>
                                  ) : (
                                    item.notes ? (
                                      <Typography variant="caption" color="text.secondary">
                                        {item.notes}
                                      </Typography>
                                    ) : null
                                  )}
                                  {/* Follow-on button for failed items */}
                                  {savedResponse === "FAIL" && isExecuting && canExecute ? (
                                    <Box sx={{ mt: 1 }}>
                                      {item.followOns.length > 0 ? (
                                        <Stack direction="row" spacing={0.75} alignItems="center">
                                          <Chip size="small"
                                            label={`${item.followOns.length} follow-on${item.followOns.length > 1 ? "s" : ""} created`}
                                            sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10 }} />
                                          <Button size="small" onClick={() => setFollowOnItem(item)}>
                                            Add another
                                          </Button>
                                        </Stack>
                                      ) : (
                                        <Button size="small" variant="outlined" color="error"
                                          startIcon={<AddIcon />}
                                          onClick={() => setFollowOnItem(item)}>
                                          Create follow-on
                                        </Button>
                                      )}
                                    </Box>
                                  ) : null}
                                </Box>
                              </Stack>
                            </Box>
                          )
                        })}
                      </Stack>
                    </Box>
                  ))
                )}

                {/* Completion hint */}
                {check.status === "IN_PROGRESS" && !allRequiredAnswered ? (
                  <Box sx={{
                    p: 1.25, borderRadius: 1.5,
                    bgcolor: "#fffbeb", border: "1px solid #fde68a"
                  }}>
                    <Typography variant="caption" color="#92400e">
                      {check.items.filter(i => i.isRequired && !i.response).length} required item(s) need a response before this check can be submitted.
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            ) : null}

            {/* Failed items tab */}
            {activeTab === 1 ? (
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  The following items failed during execution. Create follow-on actions for any that require remediation.
                </Typography>
                <Stack spacing={1}>
                  {failedItems.map(item => (
                    <Box key={item.id} sx={{
                      p: 1.5, borderRadius: 1.5,
                      border: "1px solid #fecaca", bgcolor: "#fff5f5"
                    }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                            <Chip size="small" sx={{ ...responseSx("FAIL"), height: 20, fontSize: 10 }}
                              label="FAIL" />
                            <Typography variant="body2" fontWeight={600}>{item.label}</Typography>
                          </Stack>
                          {item.notes ? (
                            <Typography variant="caption" color="text.secondary">{item.notes}</Typography>
                          ) : null}
                          {item.followOns.length > 0 ? (
                            <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                              {item.followOns.map(fo => (
                                <Chip key={fo.id} size="small"
                                  label={fo.entityType}
                                  sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10 }} />
                              ))}
                            </Stack>
                          ) : null}
                        </Box>
                        {canExecute && check.status !== "COMPLETED" && check.status !== "CLOSED" ? (
                          <Button size="small" variant="outlined" color="error"
                            onClick={() => setFollowOnItem(item)}
                            sx={{ ml: 1.5, flexShrink: 0 }}>
                            Create follow-on
                          </Button>
                        ) : null}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Stack>
            ) : null}

            {/* Summary tab */}
            {activeTab === 2 ? (
              <Stack spacing={2}>
                {check.engineerSummary ? (
                  <Box>
                    <Typography sx={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                      color: "var(--color-text-tertiary)", mb: 0.75
                    }}>
                      ENGINEER SUMMARY
                    </Typography>
                    <Box sx={{
                      p: 1.5, borderRadius: 1.5,
                      bgcolor: "var(--color-background-secondary)",
                      border: "0.5px solid var(--color-border-tertiary)"
                    }}>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {check.engineerSummary}
                      </Typography>
                    </Box>
                  </Box>
                ) : null}
                {check.reviewerNotes ? (
                  <Box>
                    <Typography sx={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                      color: "var(--color-text-tertiary)", mb: 0.75
                    }}>
                      REVIEWER NOTES
                    </Typography>
                    <Box sx={{
                      p: 1.5, borderRadius: 1.5,
                      bgcolor: "#fffbeb", border: "1px solid #fde68a"
                    }}>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {check.reviewerNotes}
                      </Typography>
                    </Box>
                  </Box>
                ) : null}
              </Stack>
            ) : null}
          </CardContent>
        </Card>

        {/* Right column */}
        <Stack spacing={2} sx={{ alignSelf: "start" }}>
          <PropertiesPanel
            rows={[
              {
                label: "Site",
                value: <Typography variant="caption" fontWeight={600}>{check.site.name}</Typography>
              },
              {
                label: "Template",
                value: <Typography variant="caption">{check.template.name}</Typography>
              },
              {
                label: "Assignee",
                value: <Typography variant="caption">
                  {check.assignee?.email.split("@")[0] ?? "Unassigned"}
                </Typography>
              },
              check.passRate !== null ? {
                label: "Pass rate",
                value: <Chip size="small"
                  sx={chipSx(check.passRate >= 80 ? "COMPLETED" : check.passRate >= 60 ? "AMBER" : "FAIL")}
                  label={`${check.passRate}%`} />
              } : null,
              failedItems.length > 0 ? {
                label: "Failed items",
                value: <Typography variant="caption" sx={{ color: "#b91c1c", fontWeight: 700 }}>
                  {failedItems.length}
                </Typography>
              } : null,
              check.scheduledAt ? {
                label: "Scheduled",
                value: <Typography variant="caption">
                  {new Date(check.scheduledAt).toLocaleDateString("en-GB")}
                </Typography>
              } : null,
              check.startedAt ? {
                label: "Started",
                value: <Typography variant="caption">
                  {new Date(check.startedAt).toLocaleDateString("en-GB")}
                </Typography>
              } : null,
              check.completedAt ? {
                label: "Completed",
                value: <Typography variant="caption">
                  {new Date(check.completedAt).toLocaleDateString("en-GB")}
                </Typography>
              } : null,
              {
                label: "Created",
                value: <Typography variant="caption">
                  {new Date(check.createdAt).toLocaleDateString("en-GB")}
                </Typography>
              }
            ].filter(Boolean) as any}
          />

          {/* Progress card */}
          {totalItems > 0 ? (
            <Card>
              <CardContent sx={{ pb: "12px !important" }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                  color: "var(--color-text-tertiary)", mb: 1.5
                }}>
                  PROGRESS
                </Typography>
                <Box sx={{
                  height: 6, borderRadius: 3,
                  bgcolor: "#f1f5f9", overflow: "hidden", mb: 1
                }}>
                  <Box sx={{
                    height: "100%",
                    width: `${Math.round((answeredItems / totalItems) * 100)}%`,
                    bgcolor: failedItems.length > 0 ? "#ef4444" : "#22c55e",
                    borderRadius: 3, transition: "width 0.3s"
                  }} />
                </Box>
                <Stack spacing={0.5}>
                  {[
                    { label: "Pass", value: check.items.filter(i => i.response === "PASS").length, color: "#15803d" },
                    { label: "Fail", value: check.items.filter(i => i.response === "FAIL").length, color: "#b91c1c" },
                    { label: "N/A", value: check.items.filter(i => i.response === "NA").length, color: "#64748b" },
                    { label: "Pending", value: check.items.filter(i => !i.response).length, color: "#94a3b8" }
                  ].filter(r => r.value > 0).map(row => (
                    <Stack key={row.label} direction="row" justifyContent="space-between">
                      <Typography variant="caption" sx={{ color: row.color, fontWeight: 600 }}>
                        {row.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: row.color, fontWeight: 700 }}>
                        {row.value}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      </Box>

      {/* Submit dialog */}
      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Submit check for review</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Once submitted, the check will be reviewed by a service manager before being marked complete.
            </Typography>
            <TextField label="Engineer summary (optional)" multiline rows={3} fullWidth
              value={engineerSummary}
              onChange={(e) => setEngineerSummary(e.target.value)}
              placeholder="Overall observations from the visit..." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={transitioning}>
            {transitioning ? "Submitting..." : "Submit for review"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {reviewAction === "approve" ? "Approve check" : "Return for rework"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {reviewAction === "return" ? (
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fef3c7", border: "1px solid #fde68a" }}>
                <Typography variant="caption" color="#92400e">
                  The check will be returned to the engineer for corrections.
                </Typography>
              </Box>
            ) : null}
            <TextField
              label={reviewAction === "return" ? "Reason for return (required)" : "Reviewer notes (optional)"}
              multiline rows={3} fullWidth
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              placeholder={reviewAction === "return"
                ? "Explain what needs to be corrected..."
                : "Sign-off comments..."} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)}>Cancel</Button>
          <Button variant="contained"
            color={reviewAction === "return" ? "warning" : "primary"}
            disabled={transitioning || (reviewAction === "return" && !reviewerNotes.trim())}
            onClick={handleReview}>
            {transitioning ? "Saving..." : reviewAction === "approve" ? "Approve" : "Return for rework"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel check</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Cancellation reason (required)" multiline rows={2} fullWidth
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>Back</Button>
          <Button variant="contained" color="error"
            disabled={!cancellationReason.trim() || transitioning}
            onClick={handleCancel}>
            Confirm cancellation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Ad-hoc item dialog */}
      <Dialog open={adHocOpen} onClose={() => setAdHocOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add checklist item</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Item label" value={adHocLabel}
              onChange={(e) => setAdHocLabel(e.target.value)} required fullWidth />
            <TextField label="Section (optional)" value={adHocSection}
              onChange={(e) => setAdHocSection(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdHocOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddAdHoc}
            disabled={!adHocLabel.trim()}>
            Add item
          </Button>
        </DialogActions>
      </Dialog>

      {/* Follow-on modal */}
      {followOnItem ? (
        <FollowOnModal
          open={!!followOnItem}
          onClose={() => setFollowOnItem(null)}
          checkId={check.id}
          item={followOnItem}
          onSuccess={() => {
            setFollowOnItem(null)
            qc.invalidateQueries({ queryKey: ["check-detail", id] })
            qc.invalidateQueries({ queryKey: ["tasks"] })
            qc.invalidateQueries({ queryKey: ["risks"] })
            qc.invalidateQueries({ queryKey: ["issues"] })
          }}
        />
      ) : null}
    </Box>
  )
}