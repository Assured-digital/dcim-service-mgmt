import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider,
  MenuItem, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { statusChipSx } from "../lib/ui"
import { ErrorState, LoadingState } from "../components/PageState"

type Risk = {
  id: string
  reference: string
  title: string
  description: string
  likelihood: string
  impact: string
  status: string
  mitigationPlan: string | null
  acceptanceNote: string | null
  reviewDate: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_FLOW: Record<string, string[]> = {
  OPEN: ["MITIGATING", "ACCEPTED", "CLOSED"],
  MITIGATING: ["OPEN", "ACCEPTED", "CLOSED"],
  ACCEPTED: ["MITIGATING", "CLOSED"],
  CLOSED: []
}

const STATUS_LABELS: Record<string, string> = {
  MITIGATING: "Mark as mitigating",
  ACCEPTED: "Accept risk",
  CLOSED: "Close risk",
  OPEN: "Reopen"
}

function riskLevelSx(level: string) {
  if (level === "HIGH") return { bgcolor: "#fdecec", color: "#b42318", fontWeight: 700 }
  if (level === "MEDIUM") return { bgcolor: "#fff5e8", color: "#b45309", fontWeight: 700 }
  return { bgcolor: "#eef2f7", color: "#475569", fontWeight: 700 }
}

export default function RiskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = React.useState(0)
  const [error, setError] = React.useState("")
  const [savingStatus, setSavingStatus] = React.useState(false)
  const [acceptanceNote, setAcceptanceNote] = React.useState("")
  const [mitigationPlan, setMitigationPlan] = React.useState("")
  const [editingMitigation, setEditingMitigation] = React.useState(false)
  const [savingMitigation, setSavingMitigation] = React.useState(false)

  const { data: risk, isLoading } = useQuery({
    queryKey: ["risk-detail", id],
    queryFn: async () => (await api.get<Risk>(`/risks/${id}`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (risk) {
      setAcceptanceNote(risk.acceptanceNote ?? "")
      setMitigationPlan(risk.mitigationPlan ?? "")
    }
  }, [risk])

  async function handleStatusUpdate(status: string) {
    setSavingStatus(true)
    setError("")
    try {
      await api.post(`/risks/${id}/status`, {
        status,
        acceptanceNote: acceptanceNote || undefined
      })
      qc.invalidateQueries({ queryKey: ["risk-detail", id] })
      qc.invalidateQueries({ queryKey: ["risks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status")
    } finally {
      setSavingStatus(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!risk) return <ErrorState title="Risk not found" />

  const nextStatuses = STATUS_FLOW[risk.status] ?? []

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/risks")}
        sx={{ mb: 2, color: "text.secondary" }}
        size="small"
      >
        Back to risks
      </Button>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
              {risk.reference}
            </Typography>
            <Chip size="small" sx={statusChipSx(risk.status)}
              label={risk.status.toLowerCase()} />
            <Chip size="small" sx={riskLevelSx(risk.likelihood)}
              label={`Likelihood: ${risk.likelihood}`} />
            <Chip size="small" sx={riskLevelSx(risk.impact)}
              label={`Impact: ${risk.impact}`} />
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{risk.title}</Typography>
        </Box>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { md: "1fr 300px" }, gap: 3 }}>

        {/* Left */}
        <Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}
            sx={{ mb: 2, borderBottom: "1px solid #e2e8f0" }}>
            <Tab label="Details" />
            <Tab label="Mitigation" />
          </Tabs>

          {tab === 0 ? (
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Description
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
                  {risk.description}
                </Typography>

                {risk.acceptanceNote ? (
                  <>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Acceptance note
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {risk.acceptanceNote}
                    </Typography>
                  </>
                ) : null}

                {risk.status === "ACCEPTED" || nextStatuses.includes("ACCEPTED") ? (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Acceptance note
                      <Typography component="span" variant="caption"
                        color="text.secondary" sx={{ ml: 1 }}>
                        required when accepting risk
                      </Typography>
                    </Typography>
                    <TextField
                      fullWidth multiline rows={3}
                      value={acceptanceNote}
                      onChange={(e) => setAcceptanceNote(e.target.value)}
                      disabled={risk.status === "CLOSED"}
                      placeholder="Explain why this risk is being accepted..."
                    />
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {tab === 1 ? (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between"
                  alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Mitigation plan
                  </Typography>
                  {!editingMitigation && risk.status !== "CLOSED" ? (
                    <Button size="small" onClick={() => setEditingMitigation(true)}>
                      {risk.mitigationPlan ? "Edit" : "Add plan"}
                    </Button>
                  ) : null}
                </Stack>

                {editingMitigation ? (
                  <Stack spacing={1.5}>
                    <TextField
                      fullWidth multiline rows={5}
                      value={mitigationPlan}
                      onChange={(e) => setMitigationPlan(e.target.value)}
                      placeholder="Describe the mitigation steps..."
                    />
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      <Button size="small" onClick={() => {
                        setEditingMitigation(false)
                        setMitigationPlan(risk.mitigationPlan ?? "")
                      }}>
                        Cancel
                      </Button>
                      <Button
                        variant="contained" size="small"
                        disabled={savingMitigation}
                        onClick={async () => {
                          setSavingMitigation(true)
                          try {
                            await api.put(`/risks/${id}`, { mitigationPlan })
                            setEditingMitigation(false)
                            qc.invalidateQueries({ queryKey: ["risk-detail", id] })
                          } finally {
                            setSavingMitigation(false)
                          }
                        }}
                      >
                        {savingMitigation ? "Saving..." : "Save"}
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Typography variant="body2" color={risk.mitigationPlan ? "text.primary" : "text.secondary"}
                    sx={{ whiteSpace: "pre-wrap" }}>
                    {risk.mitigationPlan ?? "No mitigation plan recorded yet."}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ) : null}
        </Box>

        {/* Right */}
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Details</Typography>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Likelihood</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip size="small" sx={riskLevelSx(risk.likelihood)} label={risk.likelihood} />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Impact</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip size="small" sx={riskLevelSx(risk.impact)} label={risk.impact} />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip size="small" sx={statusChipSx(risk.status)} label={risk.status} />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Logged</Typography>
                  <Typography variant="body2">
                    {new Date(risk.createdAt).toLocaleDateString("en-GB")}
                  </Typography>
                </Box>
                {risk.closedAt ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Closed</Typography>
                    <Typography variant="body2">
                      {new Date(risk.closedAt).toLocaleDateString("en-GB")}
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          {nextStatuses.length > 0 ? (
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>Workflow</Typography>
                <Stack spacing={1}>
                  {nextStatuses.map((status) => (
                    <Button
                      key={status}
                      fullWidth
                      variant={status === "CLOSED" ? "contained" : "outlined"}
                      color={status === "CLOSED" ? "primary" : "inherit"}
                      size="small"
                      disabled={
                        savingStatus ||
                        (status === "ACCEPTED" && !acceptanceNote.trim())
                      }
                      onClick={() => handleStatusUpdate(status)}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </Button>
                  ))}
                  {nextStatuses.includes("ACCEPTED") && !acceptanceNote.trim() ? (
                    <Typography variant="caption" color="text.secondary" textAlign="center">
                      Add acceptance note before accepting
                    </Typography>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      </Box>
    </Box>
  )
}