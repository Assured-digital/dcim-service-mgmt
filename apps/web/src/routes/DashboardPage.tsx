import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, ButtonGroup, Card, CardContent,
  Divider, Grid, MenuItem, Stack, TextField,
  Typography
} from "@mui/material"
import { LineChart } from "@mui/x-charts/LineChart"
import FileDownloadIcon from "@mui/icons-material/FileDownload"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import { LoadingState, ErrorState } from "../components/PageState"
import { chipSx } from "../components/shared"
import { Chip } from "@mui/material"
import { SectionHeader } from "../components/shared/primitives/SectionHeader"

// ── Types ──────────────────────────────────────────────────────────────────
type SR = { id: string; status: string; createdAt: string; updatedAt: string; assigneeId?: string | null; assignee?: { id: string; email: string } | null }
type Task = { id: string; reference: string; title: string; status: string; priority: string; dueAt: string | null; createdAt: string; updatedAt: string; assigneeId?: string | null; assignee?: { id: string; email: string } | null }
type Risk = { id: string; status: string; createdAt: string; updatedAt: string }
type Issue = { id: string; status: string; createdAt: string; updatedAt: string }
type Check = { id: string; reference: string; title: string; status: string; scheduledAt: string | null; createdAt: string; updatedAt: string; site?: { name: string } | null }

// ── Date helpers ───────────────────────────────────────────────────────────
function formatDateForInput(d: Date) {
  return d.toISOString().slice(0, 10)
}
function formatDateShort(value: string) {
  const d = new Date(value)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
function inDateRange(value: string, dateFrom: string, dateTo: string) {
  const date = new Date(value)
  if (isNaN(date.getTime())) return false
  const from = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : null
  const to = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}
function getDateRangeFromPreset(preset: "7d" | "30d" | "90d" | "ytd") {
  const now = new Date()
  const to = formatDateForInput(now)
  if (preset === "ytd") return { from: `${now.getUTCFullYear()}-01-01`, to }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90
  return { from: formatDateForInput(new Date(now.getTime() - 1000 * 60 * 60 * 24 * days)), to }
}
function isOverdue(dueAt: string | null) {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

// Build daily chart data: bucket items by created date within period
function buildChartData(
  items: { createdAt: string; updatedAt: string; status: string }[],
  dateFrom: string,
  dateTo: string,
  resolvedStatuses: string[]
) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`)
  const to = new Date(`${dateTo}T23:59:59.999Z`)
  const days: { date: string; opened: number; closed: number }[] = []

  const cursor = new Date(from)
  while (cursor <= to) {
    days.push({ date: formatDateShort(cursor.toISOString()), opened: 0, closed: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const bucketByWeek = days.length > 60

  const getBucketLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    if (bucketByWeek) {
      const weekStart = new Date(d)
      weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay())
      return formatDateShort(weekStart.toISOString())
    }
    return formatDateShort(d.toISOString())
  }

  const buckets = new Map<string, { opened: number; closed: number }>()

  const cur = new Date(from)
  while (cur <= to) {
    const label = getBucketLabel(cur.toISOString())
    if (!buckets.has(label)) buckets.set(label, { opened: 0, closed: 0 })
    cur.setUTCDate(cur.getUTCDate() + (bucketByWeek ? 7 : 1))
  }

  items.forEach(item => {
    if (inDateRange(item.createdAt, dateFrom, dateTo)) {
      const label = getBucketLabel(item.createdAt)
      const b = buckets.get(label)
      if (b) b.opened++
    }
    if (resolvedStatuses.includes(item.status) && inDateRange(item.updatedAt, dateFrom, dateTo)) {
      const label = getBucketLabel(item.updatedAt)
      const b = buckets.get(label)
      if (b) b.closed++
    }
  })

  return Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }))
}

// ── KPI stat tile ──────────────────────────────────────────────────────────
function StatTile({ label, value, tone, description, onClick, urgent }: {
  label: string; value: number; tone: string; description: string
  onClick?: () => void; urgent?: boolean
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1, minWidth: 0,
        bgcolor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderLeft: `3px solid ${urgent && value > 0 ? "#ef4444" : tone}`,
        borderRadius: "8px",
        px: "14px", py: "12px",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.12s",
        "&:hover": onClick ? { borderColor: tone, boxShadow: "0 2px 8px rgba(15,23,42,0.07)" } : {}
      }}
    >
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b", mb: "5px" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: urgent && value > 0 ? "#b91c1c" : "#0f172a" }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: "3px" }}>
        {description}
      </Typography>
    </Box>
  )
}

// ── Trend card with area chart ─────────────────────────────────────────────
function TrendCard({ label, opened, closed, closedLabel, tone, chartData, onExport, exporting }: {
  label: string; opened: number; closed: number; closedLabel: string
  tone: string; chartData: { date: string; opened: number; closed: number }[]
  onExport?: () => void; exporting?: boolean
}) {
  const total = opened + closed
  const pct = total > 0 ? Math.round((closed / total) * 100) : 0

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: "10px" }}>
        <Stack direction="row" alignItems="center" gap="6px">
          <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: tone, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{label}</Typography>
        </Stack>
        {onExport ? (
          <Box
            onClick={onExport}
            sx={{
              display: "flex", alignItems: "center", gap: "4px",
              px: "7px", py: "3px", borderRadius: "5px", cursor: "pointer",
              border: "1px solid #e2e8f0", color: "#64748b",
              "&:hover": { bgcolor: "#f8fafc", borderColor: "#cbd5e1" }
            }}
          >
            <FileDownloadIcon sx={{ fontSize: 12 }} />
            <Typography sx={{ fontSize: 11, fontWeight: 500 }}>{exporting ? "..." : "Export"}</Typography>
          </Box>
        ) : null}
      </Stack>

      <Stack direction="row" gap="20px" sx={{ mb: "10px" }}>
        <Box>
          <Typography sx={{ fontSize: 10, color: "#94a3b8", mb: "1px" }}>Opened</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>{opened}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: "#94a3b8", mb: "1px" }}>{closedLabel}</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>{closed}</Typography>
        </Box>
        <Box sx={{ ml: "auto", textAlign: "right" }}>
          <Typography sx={{ fontSize: 10, color: "#94a3b8", mb: "1px" }}>Rate</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: pct > 50 ? "#15803d" : "#0f172a", lineHeight: 1 }}>
            {pct}%
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ height: 80, mx: "-8px" }}>
        <LineChart
          xAxis={[{
            data: chartData.map((_, i) => i),
            tickInterval: [],
            disableLine: true,
            disableTicks: true
          }]}
          series={[
            {
              data: chartData.map(d => d.opened),
              label: "Opened",
              color: tone,
              showMark: false,
              area: true
            }
          ]}
          height={80}
          margin={{ top: 8, right: 8, left: -40, bottom: 8 }}
          sx={{
            "& .MuiAreaElement-root": { fillOpacity: 0.12 },
            "& .MuiChartsAxis-root": { display: "none" },
            "& .MuiChartsGrid-root": { "& line": { stroke: "#f1f5f9" } }
          }}
          slotProps={{ legend: { hidden: true } }}
        />
      </Box>
      {chartData.length > 1 ? (
        <Stack direction="row" justifyContent="space-between" sx={{ px: "4px", mt: "-4px" }}>
          <Typography sx={{ fontSize: 9, color: "#cbd5e1" }}>{chartData[0]?.date}</Typography>
          <Typography sx={{ fontSize: 9, color: "#cbd5e1" }}>{chartData[chartData.length - 1]?.date}</Typography>
        </Stack>
      ) : null}
    </Box>
  )
}

// ── Attention row ──────────────────────────────────────────────────────────
function AttentionRow({ dot, label, detail, onClick }: {
  dot: string; label: string; detail: string; onClick?: () => void
}) {
  return (
    <Box onClick={onClick} sx={{
      display: "flex", alignItems: "flex-start", gap: "10px",
      py: "10px", cursor: onClick ? "pointer" : "default",
      borderBottom: "1px solid #f1f5f9", "&:last-child": { borderBottom: "none" },
      "&:hover .attn-label": onClick ? { color: "#1d4ed8" } : {}
    }}>
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dot, flexShrink: 0, mt: "4px" }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography className="attn-label" sx={{ fontSize: 13, fontWeight: 500, color: "#0f172a", transition: "color 0.1s" }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: "#64748b", mt: "1px" }}>{detail}</Typography>
      </Box>
      {onClick ? <Typography sx={{ fontSize: 13, color: "#cbd5e1" }}>›</Typography> : null}
    </Box>
  )
}

// ── Recent row ─────────────────────────────────────────────────────────────
function RecentRow({ type, reference, title, status, updatedAt, onClick }: {
  type: string; reference: string; title: string; status: string; updatedAt: string; onClick: () => void
}) {
  const ago = (() => {
    const diff = Date.now() - new Date(updatedAt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  })()
  const typeColour: Record<string, { bg: string; color: string }> = {
    SR: { bg: "#e8f1ff", color: "#1d4ed8" },
    TASK: { bg: "#f1f5f9", color: "#475569" },
    CHECK: { bg: "#e8f1ff", color: "#1d4ed8" },
    RISK: { bg: "#fef3c7", color: "#b45309" }
  }
  const tc = typeColour[type] ?? { bg: "#f1f5f9", color: "#475569" }
  return (
    <Box onClick={onClick} sx={{
      display: "flex", alignItems: "center", gap: "10px",
      py: "9px", cursor: "pointer",
      borderBottom: "1px solid #f1f5f9", "&:last-child": { borderBottom: "none" },
      "&:hover .recent-title": { color: "#1d4ed8" }
    }}>
      <Chip label={type} size="small" sx={{ fontSize: 10, fontWeight: 600, flexShrink: 0, bgcolor: tc.bg, color: tc.color, borderRadius: "4px", height: 18 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography className="recent-title" sx={{ fontSize: 13, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.1s" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{reference}</Typography>
      </Box>
      <Stack direction="row" alignItems="center" gap="8px" sx={{ flexShrink: 0 }}>
        <Chip size="small" label={status.toLowerCase().replace(/_/g, " ")} sx={{ ...chipSx(status), height: 20, fontSize: 10 }} />
        <Typography sx={{ fontSize: 11, color: "#94a3b8", minWidth: 36, textAlign: "right" }}>{ago}</Typography>
      </Stack>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()

  const defaultRange = getDateRangeFromPreset("30d")
  const [dateFrom, setDateFrom] = React.useState(defaultRange.from)
  const [dateTo, setDateTo] = React.useState(defaultRange.to)
  const [assigneeId, setAssigneeId] = React.useState("")
  const [activePreset, setActivePreset] = React.useState<"7d" | "30d" | "90d" | "ytd">("30d")
  const [isExporting, setIsExporting] = React.useState<string | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────
  const srs = useQuery({ queryKey: ["srs"], queryFn: async () => (await api.get<SR[]>("/service-requests")).data })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: async () => (await api.get<Task[]>("/tasks")).data })
  const risks = useQuery({ queryKey: ["risks"], queryFn: async () => (await api.get<Risk[]>("/risks")).data })
  const issues = useQuery({ queryKey: ["issues"], queryFn: async () => (await api.get<Issue[]>("/issues")).data })
  const checks = useQuery({ queryKey: ["checks"], queryFn: async () => (await api.get<Check[]>("/checks")).data })
  const isLoading = srs.isLoading || tasks.isLoading || risks.isLoading || issues.isLoading || checks.isLoading
  const hasError = !!(srs.error || tasks.error || risks.error || issues.error || checks.error)

  // ── Assignees ──────────────────────────────────────────────────────────
  const assignees = React.useMemo(() => {
    const byId = new Map<string, { id: string; email: string }>()
    ;[...(srs.data ?? []), ...(tasks.data ?? [])].forEach(item => {
      if (item.assignee?.id) byId.set(item.assignee.id, item.assignee)
    })
    return Array.from(byId.values()).sort((a, b) => a.email.localeCompare(b.email))
  }, [srs.data, tasks.data])

  function applyAssignee<T extends { assigneeId?: string | null }>(items: T[]) {
    return assigneeId ? items.filter(x => x.assigneeId === assigneeId) : items
  }

  const filteredSrs = applyAssignee(srs.data ?? [])
  const filteredTasks = applyAssignee(tasks.data ?? [])

  // ── KPI metrics ────────────────────────────────────────────────────────
  const openSRs = filteredSrs.filter(x => !["CLOSED", "COMPLETED"].includes(x.status)).length
  const openRisks = (risks.data ?? []).filter(x => !["ACCEPTED", "CLOSED"].includes(x.status)).length
  const openIssues = (issues.data ?? []).filter(x => !["RESOLVED", "CLOSED"].includes(x.status)).length
  const openTasks = filteredTasks.filter(x => x.status !== "DONE").length
  const pendingReviewChecks = (checks.data ?? []).filter(x => x.status === "PENDING_REVIEW").length

  // ── Trend data (period-filtered) ───────────────────────────────────────
  const srInPeriod = filteredSrs.filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const srClosedInPeriod = filteredSrs.filter(x => ["COMPLETED", "CLOSED"].includes(x.status) && inDateRange(x.updatedAt, dateFrom, dateTo))
  const risksInPeriod = (risks.data ?? []).filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const risksClosed = (risks.data ?? []).filter(x => ["ACCEPTED", "CLOSED"].includes(x.status) && inDateRange(x.updatedAt, dateFrom, dateTo))
  const issuesInPeriod = (issues.data ?? []).filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const issuesClosed = (issues.data ?? []).filter(x => ["RESOLVED", "CLOSED"].includes(x.status) && inDateRange(x.updatedAt, dateFrom, dateTo))
  const tasksInPeriod = filteredTasks.filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const tasksDone = filteredTasks.filter(x => x.status === "DONE" && inDateRange(x.updatedAt, dateFrom, dateTo))

  // ── Chart data ─────────────────────────────────────────────────────────
  const srChart = buildChartData(filteredSrs, dateFrom, dateTo, ["COMPLETED", "CLOSED"])
  const riChart = buildChartData([...(risks.data ?? []), ...(issues.data ?? [])], dateFrom, dateTo, ["ACCEPTED", "CLOSED", "RESOLVED"])
  const taskChart = buildChartData(filteredTasks, dateFrom, dateTo, ["DONE"])

  // ── Attention items ────────────────────────────────────────────────────
  const overdueTasks = filteredTasks.filter(t => t.status !== "DONE" && isOverdue(t.dueAt))
  const overdueChecks = (checks.data ?? []).filter(c => !["COMPLETED", "CLOSED", "CANCELLED"].includes(c.status) && isOverdue(c.scheduledAt))

  // ── Recent activity ────────────────────────────────────────────────────
  const recentItems = [
    ...(srs.data ?? []).map(x => ({ kind: "SR", id: x.id, reference: "", title: `Service request · ${x.status}`, status: x.status, updatedAt: x.updatedAt })),
    ...(tasks.data ?? []).map(x => ({ kind: "TASK", id: x.id, reference: x.reference, title: x.title, status: x.status, updatedAt: x.updatedAt })),
    ...(checks.data ?? []).map(x => ({ kind: "CHECK", id: x.id, reference: x.reference, title: x.title, status: x.status, updatedAt: x.updatedAt })),
    ...(risks.data ?? []).map(x => ({ kind: "RISK", id: x.id, reference: "", title: `Risk · ${x.status}`, status: x.status, updatedAt: x.updatedAt }))
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6)

  // ── Export ─────────────────────────────────────────────────────────────
  async function exportCsv(kind: "service-requests" | "tasks") {
    setIsExporting(kind)
    try {
      const res = await api.get<Blob>(`/${kind}/export`, {
        params: { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, assigneeId: assigneeId || undefined },
        responseType: "blob"
      })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8;" }))
      const a = document.createElement("a")
      a.href = url; a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } finally { setIsExporting(null) }
  }

  function applyPreset(preset: "7d" | "30d" | "90d" | "ytd") {
    const range = getDateRangeFromPreset(preset)
    setDateFrom(range.from); setDateTo(range.to); setActivePreset(preset)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Box>
      <Box sx={{ mb: "24px" }}>
        <Typography variant="h4" sx={{ fontWeight: 400, lineHeight: 1.2 }}>Dashboard</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: "4px" }}>
          Live operational pulse for the selected client
        </Typography>
      </Box>

      {isLoading ? <LoadingState label="Loading dashboard..." /> : null}
      {hasError ? <ErrorState title="Failed to load dashboard data" /> : null}

      {!isLoading && !hasError ? (
        <Stack spacing="20px">

          {/* ── Unified Trend + KPI card ─────────────────────────────── */}
          <Card variant="outlined">
            <CardContent>

              {/* Filter bar */}
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap="12px" sx={{ mb: "20px" }}>
                <SectionHeader
                  label="Trend Snapshot"
                  action={<TrendingUpIcon sx={{ fontSize: 15, color: "var(--color-text-secondary)" }} />}
                />
                <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                  <TextField
                    select size="small" label="Assignee" value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    sx={{ minWidth: 150, "& .MuiInputBase-root": { fontSize: 12 } }}
                  >
                    <MenuItem value="" sx={{ fontSize: 12 }}>All assignees</MenuItem>
                    {assignees.map(a => (
                      <MenuItem key={a.id} value={a.id} sx={{ fontSize: 12 }}>{a.email}</MenuItem>
                    ))}
                  </TextField>
                  <ButtonGroup size="small" variant="outlined">
                    {(["7d", "30d", "90d", "ytd"] as const).map(p => (
                      <Button key={p}
                        variant={activePreset === p ? "contained" : "outlined"}
                        onClick={() => applyPreset(p)}
                        sx={{ fontSize: 11, fontWeight: 500, px: "10px", minWidth: 0 }}>
                        {p.toUpperCase()}
                      </Button>
                    ))}
                  </ButtonGroup>
                  <Button size="small" variant="text"
                    onClick={() => { applyPreset("30d"); setAssigneeId("") }}
                    sx={{ fontSize: 11, color: "#64748b" }}>
                    Reset
                  </Button>
                </Stack>
              </Stack>

              {/* Three trend cards with charts */}
              <Stack direction={{ xs: "column", md: "row" }} gap="24px" divider={<Divider orientation="vertical" flexItem />}>
                <TrendCard
                  label="Service Requests" tone="#2563eb"
                  opened={srInPeriod.length} closed={srClosedInPeriod.length}
                  closedLabel="Closed" chartData={srChart}
                  onExport={() => exportCsv("service-requests")}
                  exporting={isExporting === "service-requests"}
                />
                <TrendCard
                  label="Risks & Issues" tone="#f59e0b"
                  opened={risksInPeriod.length + issuesInPeriod.length}
                  closed={risksClosed.length + issuesClosed.length}
                  closedLabel="Closed" chartData={riChart}
                />
                <TrendCard
                  label="Tasks" tone="#0f766e"
                  opened={tasksInPeriod.length} closed={tasksDone.length}
                  closedLabel="Done" chartData={taskChart}
                  onExport={() => exportCsv("tasks")}
                  exporting={isExporting === "tasks"}
                />
              </Stack>

              {/* Divider + KPI tiles */}
              <Divider sx={{ my: "20px" }} />

              <Box sx={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <StatTile label="Open SRs" value={openSRs} tone="#2563eb" description="Not yet closed" onClick={() => navigate("/service-desk")} />
                <StatTile label="Open Risks" value={openRisks} tone="#f59e0b" description="Active risks" urgent onClick={() => navigate("/risks")} />
                <StatTile label="Open Issues" value={openIssues} tone="#dc2626" description="Unresolved issues" urgent onClick={() => navigate("/issues")} />
                <StatTile label="Open Tasks" value={openTasks} tone="#0f766e" description="Not yet done" onClick={() => navigate("/tasks")} />
                <StatTile label="Pending Review" value={pendingReviewChecks} tone="#7c3aed" description="Checks awaiting review" urgent onClick={() => navigate("/checks")} />
              </Box>
            </CardContent>
          </Card>

          {/* ── Attention + Recent ───────────────────────────────────── */}
          <Grid container spacing="16px">

            <Grid item xs={12} md={5}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Box sx={{ mb: "12px" }}>
                    <SectionHeader
                      label="Needs Attention"
                      action={
                        overdueTasks.length === 0 && overdueChecks.length === 0 && pendingReviewChecks === 0
                          ? <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#22c55e" }} />
                          : <WarningAmberIcon sx={{ fontSize: 14, color: "#f59e0b" }} />
                      }
                    />
                  </Box>
                  {overdueTasks.length === 0 && overdueChecks.length === 0 && pendingReviewChecks === 0 ? (
                    <Typography variant="body2" color="text.secondary">Nothing needs attention right now.</Typography>
                  ) : null}
                  {overdueTasks.slice(0, 3).map(t => (
                    <AttentionRow key={t.id} dot="#ef4444" label={t.title}
                      detail={`Task overdue · due ${new Date(t.dueAt!).toLocaleDateString("en-GB")}`}
                      onClick={() => navigate(`/tasks/${t.id}`)} />
                  ))}
                  {overdueTasks.length > 3 ? (
                    <Typography sx={{ fontSize: 12, color: "#2563eb", cursor: "pointer", mt: "6px" }} onClick={() => navigate("/tasks")}>
                      +{overdueTasks.length - 3} more overdue tasks →
                    </Typography>
                  ) : null}
                  {pendingReviewChecks > 0 ? (
                    <AttentionRow dot="#f59e0b"
                      label={`${pendingReviewChecks} check${pendingReviewChecks > 1 ? "s" : ""} pending review`}
                      detail="Awaiting review approval"
                      onClick={() => navigate("/checks")} />
                  ) : null}
                  {overdueChecks.slice(0, 2).map(c => (
                    <AttentionRow key={c.id} dot="#f59e0b" label={c.title}
                      detail={`Check overdue · ${c.site?.name ?? ""}`}
                      onClick={() => navigate(`/checks/${c.id}`)} />
                  ))}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={7}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Box sx={{ mb: "12px" }}>
                    <SectionHeader
                      label="Recent Activity"
                      action={<Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>Last updated items</Typography>}
                    />
                  </Box>
                  {recentItems.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No recent activity.</Typography>
                  ) : null}
                  {recentItems.map(item => (
                    <RecentRow
                      key={`${item.kind}-${item.id}`}
                      type={item.kind} reference={item.reference ?? ""} title={item.title}
                      status={item.status} updatedAt={item.updatedAt}
                      onClick={() => {
                        if (item.kind === "SR") navigate("/service-desk")
                        else if (item.kind === "TASK") navigate(`/tasks/${item.id}`)
                        else if (item.kind === "CHECK") navigate(`/checks/${item.id}`)
                        else if (item.kind === "RISK") navigate("/risks")
                      }}
                    />
                  ))}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

        </Stack>
      ) : null}
    </Box>
  )
}