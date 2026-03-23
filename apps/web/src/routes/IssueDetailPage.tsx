import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider,
  Stack, TextField, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { ErrorState, LoadingState } from "../components/PageState"

type Issue = {
  id: string
  reference: string
  title: string
  description: string
  priority: string
  status: string
  resolution: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_FLOW: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["OPEN", "CLOSED"],
  CLOSED: []
}

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "Start working",
  CLOSED: "Close issue",
  OPEN: "Reopen"
}

export default function IssueDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [error, setError] = React.useState("")
  const [savingStatus, setSavingStatus] = React.useState(false)
  const [resolution, setResolution] = React.useState("")

  const { data: issue, isLoading } = useQuery({
    queryKey: ["issue-detail", id],
    queryFn: async () => (await api.get<Issue>(`/issues/${id}`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (issue) setResolution(issue.resolution ?? "")
  }, [issue])

  async function handleStatusUpdate(status: string) {
    setSavingStatus(true)
    setError("")
    try {
      await api.post(`/issues/${id}/status`, {
        status,
        resolution: resolution || undefined
      })
      qc.invalidateQueries({ queryKey: ["issue-detail", id] })
      qc.invalidateQueries({ queryKey: ["issues"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status")
    } finally {
      setSavingStatus(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!issue) return <ErrorState title="Issue not found" />

  const nextStatuses = STATUS_FLOW[issue.status] ?? []
  const needsResolution = nextStatuses.includes("CLOSED")

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/issues")}
        sx={{ mb: 2, color: "text.secondary" }}
        size="small"
      >
        Back to issues
      </Button>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
              {issue.reference}
            </Typography>
            <Chip size="small" sx={statusChipSx(issue.status)}
              label={issue.status.toLowerCase()} />
            <Chip size="small" sx={priorityChipSx(issue.priority.toLowerCase())}
              label={issue.priority} />
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{issue.title}</Typography>
        </Box>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { md: "1fr 300px" }, gap: 3 }}>

        {/* Left */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Description
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
              {issue.description}
            </Typography>

            {needsResolution || issue.resolution ? (
              <>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Resolution
                  {needsResolution && issue.status !== "CLOSED" ? (
                    <Typography component="span" variant="caption"
                      color="text.secondary" sx={{ ml: 1 }}>
                      required before closing
                    </Typography>
                  ) : null}
                </Typography>
                <TextField
                  fullWidth multiline rows={3}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  disabled={issue.status === "CLOSED"}
                  placeholder="Describe how this issue was resolved..."
                />
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Right */}
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Details</Typography>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip size="small" sx={priorityChipSx(issue.priority.toLowerCase())}
                      label={issue.priority} />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip size="small" sx={statusChipSx(issue.status)} label={issue.status} />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Logged</Typography>
                  <Typography variant="body2">
                    {new Date(issue.createdAt).toLocaleDateString("en-GB")}
                  </Typography>
                </Box>
                {issue.closedAt ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Closed</Typography>
                    <Typography variant="body2">
                      {new Date(issue.closedAt).toLocaleDateString("en-GB")}
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
                      size="small"
                      disabled={
                        savingStatus ||
                        (status === "CLOSED" && !resolution.trim())
                      }
                      onClick={() => handleStatusUpdate(status)}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </Button>
                  ))}
                  {nextStatuses.includes("CLOSED") && !resolution.trim() ? (
                    <Typography variant="caption" color="text.secondary" textAlign="center">
                      Add resolution before closing
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