import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, InputAdornment, MenuItem, Pagination, Snackbar, Stack,
  TextField, Tooltip, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import FileDownloadIcon from "@mui/icons-material/FileDownload"
import SearchIcon from "@mui/icons-material/Search"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { CheckCard, effectiveCompleted, type Check } from "../components/checks/CheckCard"
import { downloadCheckReport } from "../lib/checkReport"
import { userLabel } from "../lib/userDisplay"

// History = the archive of finished checks (the inverse of the active landing's
// partitionChecks filter). Reuses the SAME GET /checks payload + query cache as the
// landing — listForClient returns every status; the landing keeps the active set,
// this page keeps the terminal set, presented as the SAME CheckCard (variant="history")
// so the archive reads as the same surface. The volume concern is handled by pagination
// (never the whole archive at once), so the card view scales. This is the reporting
// surface; the per-card Download Report + CSV export are the reporting actions.
// CANCELLED is included so abandoned checks remain findable (they appear on neither the
// active landing nor as a completed record otherwise) — no report, "—" pass rate.
const TERMINAL_STATUSES = new Set(["COMPLETED", "CLOSED", "CANCELLED"])
const STATUS_LABELS: Record<string, string> = { COMPLETED: "Completed", CLOSED: "Closed", CANCELLED: "Cancelled" }

// Default to a bounded window so history never loads unbounded; "All time" is the
// show-all escape hatch. (v1 — a full date-range picker can follow.)
const WINDOW_DAYS: Record<string, number | null> = { "90d": 90, "365d": 365, all: null }
const DAY_MS = 86_400_000

// Each page is a bounded, modest set of cards regardless of total archive size.
const PAGE_SIZE = 16

type SortKey = "completed" | "passRate" | "site"

function failCount(items: { response: string | null }[]): number {
  return items.filter((i) => i.response === "FAIL").length
}

// Sort comparators — the reporting orders a table's column headers would have given.
// Cancelled/never-scored checks (null pass rate) sink to the end of a pass-rate sort;
// site-less checks sink to the end of a site sort.
// eslint-disable-next-line no-unused-vars
const SORTERS: Record<SortKey, (a: Check, b: Check) => number> = {
  completed: (a, b) => (effectiveCompleted(b)?.getTime() ?? 0) - (effectiveCompleted(a)?.getTime() ?? 0),
  passRate: (a, b) => {
    const av = a.status === "CANCELLED" ? null : a.passRate
    const bv = b.status === "CANCELLED" ? null : b.passRate
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return av - bv // low -> high: surfaces the checks that need attention first
  },
  site: (a, b) => {
    const an = a.site?.name ?? ""
    const bn = b.site?.name ?? ""
    if (!an && !bn) return 0
    if (!an) return 1 // site-less checks sink to the end
    if (!bn) return -1
    return an.localeCompare(bn)
  },
}

// CSV cell — quote + escape anything containing a comma, quote or newline.
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Export the FULL filtered/sorted set (every page, not just the visible one) — the
// reporting export the DataGrid toolbar used to give. BOM + CRLF so Excel opens it clean.
function exportCsv(rows: Check[]) {
  const header = ["Ref", "Title", "Site", "Template", "Engineer", "Completed", "Pass rate", "Fails", "Status"]
  const lines = [header.join(",")]
  for (const c of rows) {
    const d = effectiveCompleted(c)
    const cancelled = c.status === "CANCELLED"
    lines.push([
      csvCell(c.reference),
      csvCell(c.title),
      csvCell(c.site?.name ?? ""),
      csvCell(c.template?.name ?? ""),
      csvCell(userLabel(c.assignee)),
      csvCell(d ? d.toLocaleDateString("en-GB") : ""),
      csvCell(cancelled || c.passRate == null ? "" : `${Math.round(c.passRate)}%`),
      csvCell(cancelled ? "" : failCount(c.items)),
      csvCell(STATUS_LABELS[c.status] ?? c.status),
    ].join(","))
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `checks-history-${new Date().toISOString().split("T")[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

const selectSx = {
  minWidth: 168,
  "& .MuiOutlinedInput-root": { bgcolor: "#ffffff" },
  "& .MuiSelect-select": { fontSize: 12, fontWeight: 500, color: "#475569", py: "8.5px" },
}

export default function CheckHistoryPage() {
  const navigate = useNavigate()
  // View state (page/sort/search/window) lives in the URL — so a return from a check detail
  // restores exactly where the user was, and a history view is shareable/bookmarkable. Defaults
  // are omitted from the URL (no ?window=90d noise); an invalid value falls back to its default.
  const [searchParams, setSearchParams] = useSearchParams()
  const rawWindow = searchParams.get("window")
  const windowKey: keyof typeof WINDOW_DAYS = rawWindow && rawWindow in WINDOW_DAYS ? (rawWindow as keyof typeof WINDOW_DAYS) : "90d"
  const rawSort = searchParams.get("sort")
  const sortKey: SortKey = rawSort && rawSort in SORTERS ? (rawSort as SortKey) : "completed"
  const search = searchParams.get("q") ?? ""
  const rawPage = Number(searchParams.get("page"))
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1

  // Patch the URL view-state. replace: true so adjusting filters/paging never stacks browser-
  // history entries — Back from the opened check lands on the history view at these exact params.
  function patchParams(patch: Partial<{ q: string; sort: SortKey; window: string; page: number }>) {
    const next = new URLSearchParams(searchParams)
    const setOrDel = (key: string, value: string, isDefault: boolean) => {
      if (!value || isDefault) next.delete(key)
      else next.set(key, value)
    }
    if ("q" in patch) setOrDel("q", patch.q ?? "", !patch.q)
    if ("sort" in patch) setOrDel("sort", patch.sort ?? "", patch.sort === "completed")
    if ("window" in patch) setOrDel("window", patch.window ?? "", patch.window === "90d")
    if ("page" in patch) setOrDel("page", String(patch.page ?? 1), (patch.page ?? 1) <= 1)
    setSearchParams(next, { replace: true })
  }

  // Per-card report download: which row is generating + a transient error toast. The PDF is
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

  // Terminal set, filtered by window + search, then sorted. Pagination slices this below.
  const filtered = React.useMemo(() => {
    const days = WINDOW_DAYS[windowKey]
    const cutoff = days == null ? null : new Date(Date.now() - days * DAY_MS)
    const q = search.trim().toLowerCase()
    return (data ?? [])
      .filter((c) => TERMINAL_STATUSES.has(c.status))
      .filter((c) => {
        if (!cutoff) return true
        const d = effectiveCompleted(c)
        return d ? d >= cutoff : false
      })
      .filter((c) => {
        if (!q) return true
        return (
          c.reference.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.site?.name ?? "").toLowerCase().includes(q)
        )
      })
      .sort(SORTERS[sortKey])
  }, [data, windowKey, search, sortKey])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header — mirrors the active landing: back + context left, actions right */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
      >
        <Tooltip title="Back to active checks">
          <Button
            size="small"
            variant="outlined"
            startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate("/checks")}
            sx={{ fontSize: 12 }}
          >
            Active checks
          </Button>
        </Tooltip>
        <Typography
          sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 20, fontWeight: 700, color: "#0f172a", flex: 1 }}
        >
          Check history
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
          disabled={filtered.length === 0}
          onClick={() => exportCsv(filtered)}
          sx={{ fontSize: 12 }}
        >
          Export CSV
        </Button>
      </Stack>

      {/* Controls — search (ref / title / site) + sort + window */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
        <TextField
          size="small"
          placeholder="Search ref, title or site"
          value={search}
          onChange={(e) => patchParams({ q: e.target.value, page: 1 })}
          sx={{ flex: 1, "& .MuiOutlinedInput-root": { bgcolor: "#ffffff" }, "& .MuiInputBase-input": { fontSize: 12.5 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          value={sortKey}
          onChange={(e) => patchParams({ sort: e.target.value as SortKey, page: 1 })}
          sx={selectSx}
        >
          <MenuItem value="completed">Completed · newest</MenuItem>
          <MenuItem value="passRate">Pass rate · low to high</MenuItem>
          <MenuItem value="site">Site · A–Z</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          value={windowKey}
          onChange={(e) => patchParams({ window: e.target.value, page: 1 })}
          sx={selectSx}
        >
          <MenuItem value="90d">Last 90 days</MenuItem>
          <MenuItem value="365d">Last 12 months</MenuItem>
          <MenuItem value="all">All time</MenuItem>
        </TextField>
      </Stack>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load check history" /> : null}

      {!isLoading && !error && filtered.length === 0 ? (
        <EmptyState
          title={search.trim() ? "No matching checks" : "No completed checks"}
          detail={search.trim()
            ? "No archived checks match your search in this window."
            : windowKey === "all"
              ? "No checks have been completed, closed or cancelled yet."
              : "No checks completed in this window. Widen the window to see older records."}
        />
      ) : null}

      {!isLoading && !error && filtered.length > 0 ? (
        <>
          <Typography sx={{ fontSize: 12, color: "#64748b" }}>
            {filtered.length} {filtered.length === 1 ? "check" : "checks"}
          </Typography>
          <Stack spacing={1}>
            {pageRows.map((c) => (
              <CheckCard
                key={c.id}
                check={c}
                variant="history"
                // Tag the origin so the check detail offers a "Back to history" return; the
                // history view-state rides in the URL, so Back lands here at these exact params.
                onOpen={(id) => navigate(`/checks/${id}`, { state: { from: "history" } })}
                onDownloadReport={handleDownloadReport}
                downloading={downloadingId === c.id}
              />
            ))}
          </Stack>
          {pageCount > 1 ? (
            <Stack direction="row" justifyContent="center" sx={{ pt: 0.5 }}>
              <Pagination
                count={pageCount}
                page={safePage}
                onChange={(_e, p) => patchParams({ page: p })}
                size="small"
                shape="rounded"
                color="primary"
              />
            </Stack>
          ) : null}
        </>
      ) : null}

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
