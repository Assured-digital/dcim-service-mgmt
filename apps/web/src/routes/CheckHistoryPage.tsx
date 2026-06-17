import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CircularProgress, IconButton, MenuItem, Snackbar, TextField,
  Tooltip, Typography, useMediaQuery, useTheme
} from "@mui/material"
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import DownloadIcon from "@mui/icons-material/Download"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import { StatusPill, ragTokens } from "../components/shared"
import { type Check } from "../components/checks/CheckCard"
import { downloadCheckReport } from "../lib/checkReport"

// History = the archive of finished checks (the inverse of the active landing's
// partitionChecks filter). Reuses the SAME GET /checks payload + query cache as the
// landing — listForClient returns every status; the landing keeps the active set,
// this page keeps the terminal set. This is the reporting surface; the per-check
// Download Report (Step 4) will land in the placeholder column below.
// CANCELLED is included so abandoned checks remain findable in the archive (they
// appear on neither the active landing nor as a completed record otherwise). They
// have no completedAt and no meaningful pass rate — the columns below render "—".
const TERMINAL_STATUSES = new Set(["COMPLETED", "CLOSED", "CANCELLED"])
const STATUS_LABELS: Record<string, string> = { COMPLETED: "Completed", CLOSED: "Closed", CANCELLED: "Cancelled" }

// Effective "completed" date for a terminal check — completedAt is set on completion
// and retained through CLOSED; the fallbacks cover any legacy/edge row that reached a
// terminal state without one. Used for the column, the default sort and the window.
function effectiveCompleted(c: Check): Date | null {
  const iso = c.completedAt ?? c.closedAt ?? c.submittedAt ?? c.updatedAt
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function failCount(items: { response: string | null }[]): number {
  return items.filter((i) => i.response === "FAIL").length
}

// Default to a bounded window so history never loads unbounded; "All time" is the
// show-all escape hatch. (v1 — a full date-range picker can follow.)
const WINDOW_DAYS: Record<string, number | null> = { "90d": 90, "365d": 365, all: null }
const DAY_MS = 86_400_000

const HistoryToolbar = makeGridToolbar("checks-history")

// Static columns. The Report column is appended inside the component so its cell can
// reach the per-row download handler + downloading state (the old placeholder lived here).
const baseColumns: GridColDef<Check>[] = [
  {
    field: "reference", headerName: "Ref", width: 120,
    renderCell: (p) => (
      <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#475569" }}>
        {p.value as string}
      </Typography>
    ),
  },
  {
    field: "title", headerName: "Title", flex: 1, minWidth: 200,
    renderCell: (p: GridRenderCellParams<Check>) => (
      <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
        {p.value as string}
      </Typography>
    ),
  },
  {
    field: "site", headerName: "Site", width: 150,
    valueGetter: (_v, row) => row.site?.name ?? "—",
  },
  {
    field: "template", headerName: "Template", width: 170,
    valueGetter: (_v, row) => row.template?.name ?? "—",
  },
  {
    field: "assignee", headerName: "Engineer", width: 150,
    valueGetter: (_v, row) => row.assignee?.displayName ?? "Unassigned",
  },
  {
    field: "completedAt", headerName: "Completed", width: 130, type: "date",
    valueGetter: (_v, row) => effectiveCompleted(row),
    renderCell: (p) => (
      <Typography sx={{ fontSize: 12.5, color: "#64748b" }}>
        {p.value ? (p.value as Date).toLocaleDateString("en-GB") : "—"}
      </Typography>
    ),
  },
  {
    field: "passRate", headerName: "Pass rate", width: 110, type: "number", align: "right", headerAlign: "right",
    renderCell: (p) => {
      const v = p.row.passRate
      // Cancelled checks were never scored -> "—", never a misleading 0%/value.
      if (p.row.status === "CANCELLED" || v == null) return <Typography sx={{ fontSize: 12.5, color: "#94a3b8" }}>—</Typography>
      const color = v >= 80 ? ragTokens.GREEN.text : v >= 60 ? ragTokens.AMBER.text : ragTokens.RED.text
      return <Typography sx={{ fontSize: 12.5, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{Math.round(v)}%</Typography>
    },
  },
  {
    field: "fails", headerName: "Fails", width: 90, type: "number", align: "right", headerAlign: "right",
    // null for cancelled -> sorts as empty and renders "—" (no responses to fail).
    valueGetter: (_v, row) => row.status === "CANCELLED" ? null : failCount(row.items),
    renderCell: (p) => {
      if (p.row.status === "CANCELLED" || p.value == null) return <Typography sx={{ fontSize: 12.5, color: "#94a3b8" }}>—</Typography>
      const n = p.value as number
      return <Typography sx={{ fontSize: 12.5, fontWeight: n > 0 ? 700 : 500, color: n > 0 ? ragTokens.RED.text : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{n}</Typography>
    },
  },
  {
    field: "status", headerName: "Status", width: 130,
    renderCell: (p) => <StatusPill value={p.value as string} label={STATUS_LABELS[p.value as string] ?? (p.value as string)} size="sm" />,
  },
]

export default function CheckHistoryPage() {
  const navigate = useNavigate()
  const theme = useTheme()
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"))
  const [windowKey, setWindowKey] = React.useState<keyof typeof WINDOW_DAYS>("90d")
  // Per-row report download: which row is generating + a transient error toast. The PDF is
  // generated server-side on demand and streamed back through the authed api client.
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
  const [reportError, setReportError] = React.useState<string | null>(null)

  // Same key + endpoint as the landing -> shares the cache (instant cross-navigation).
  const { data, isLoading, error } = useQuery({
    queryKey: ["checks"],
    queryFn: async () => (await api.get<Check[]>("/checks")).data,
  })

  async function handleDownloadReport(check: Check) {
    if (downloadingId) return // one at a time — avoids hammering the on-demand generator
    setDownloadingId(check.id)
    setReportError(null)
    try {
      await downloadCheckReport(check.id, check.reference)
    } catch {
      setReportError(`Couldn't generate the report for ${check.reference}. Please try again.`)
    } finally {
      setDownloadingId(null)
    }
  }

  // Report column lives here so its cell can reach the handler + downloading state.
  // Cancelled checks have nothing to report -> no affordance (matches the columns above).
  const columns = React.useMemo<GridColDef<Check>[]>(() => [
    ...baseColumns,
    {
      field: "report", headerName: "Report", width: 90, sortable: false, filterable: false, disableExport: true,
      renderCell: (p: GridRenderCellParams<Check>) => p.row.status === "CANCELLED" ? null : (
        <Box onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Download report (PDF)">
            <span>
              <IconButton
                size="small"
                disabled={!!downloadingId}
                onClick={() => handleDownloadReport(p.row)}
              >
                {downloadingId === p.row.id
                  ? <CircularProgress size={16} />
                  : <DownloadIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ], [downloadingId]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = React.useMemo(() => {
    const days = WINDOW_DAYS[windowKey]
    const cutoff = days == null ? null : new Date(Date.now() - days * DAY_MS)
    return (data ?? [])
      .filter((c) => TERMINAL_STATUSES.has(c.status))
      .filter((c) => {
        if (!cutoff) return true
        const d = effectiveCompleted(c)
        return d ? d >= cutoff : false
      })
  }, [data, windowKey])

  return (
    <Box>
      <Card>
        <Box
          sx={{
            borderBottom: "1px solid #e2e8f0",
            px: 2, py: 1.25,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 1.5, flexWrap: "wrap",
          }}
        >
          <Button
            size="small"
            startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate("/checks")}
            sx={{ fontSize: 12 }}
          >
            Active checks
          </Button>
          <TextField
            select
            size="small"
            label="Window"
            value={windowKey}
            onChange={(e) => setWindowKey(e.target.value as keyof typeof WINDOW_DAYS)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="90d">Last 90 days</MenuItem>
            <MenuItem value="365d">Last 12 months</MenuItem>
            <MenuItem value="all">All time</MenuItem>
          </TextField>
        </Box>

        {isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {error ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load check history" /></Box> : null}
        {!isLoading && !error && rows.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState
              title="No completed checks"
              detail={windowKey === "all"
                ? "No checks have been completed or closed yet."
                : "No checks completed in this window. Widen the window to see older records."}
            />
          </Box>
        ) : null}

        {rows.length > 0 ? (
          <Box sx={{ height: { xs: 520, md: 680 } }}>
            <DataGrid
              rows={rows}
              columns={columns}
              density="compact"
              initialState={{
                sorting: { sortModel: [{ field: "completedAt", sort: "desc" }] },
                pagination: { paginationModel: { pageSize: 25 } },
                columns: { columnVisibilityModel: isSmall ? { template: false, passRate: false, fails: false } : {} },
              }}
              pageSizeOptions={[25, 50, 100]}
              disableRowSelectionOnClick
              onRowClick={(params) => navigate(`/checks/${(params.row as Check).id}`)}
              slots={{ toolbar: HistoryToolbar }}
              sx={dataGridSx(true)}
            />
          </Box>
        ) : null}
      </Card>

      <Snackbar
        open={!!reportError}
        autoHideDuration={5000}
        onClose={() => setReportError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" variant="filled" onClose={() => setReportError(null)}>
          {reportError}
        </Alert>
      </Snackbar>
    </Box>
  )
}
