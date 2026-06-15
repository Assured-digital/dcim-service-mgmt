import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Box, Stack, Typography } from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { api } from "../lib/api"
import { statusSolid } from "../components/shared/tokens/colors"
import { getCurrentUser } from "../lib/auth"
import {
  parseRIParams, buildUnifiedRows, type Risk, type Issue, type UnifiedRow,
} from "../lib/risksIssuesQueue"

const STALE_TIME = 60_000
const KIND_LABEL: Record<UnifiedRow["kind"], string> = { RSK: "Risk", ISS: "Issue" }

// Created date, DD/MM/YY, for the rail row's secondary line.
function formatCreated(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

// ── Risks & Issues working-queue rail (depth-1 record selector) ────────────
//
// Rendered by RisksIssuesNavigator as the compressed list panel's railContent.
// Shows the EXACT filtered/sorted set the depth-0 grid showed — both derive it
// from the same URL params via the same lib/risksIssuesQueue selector, so the
// rail IS the working queue. Clicking an item swaps the open record (replace, so
// browser-back returns to the list, not through each record viewed). The filter
// query string is preserved on every navigation so the rail set stays put.
// Mirrors ServiceDeskQueueRail.

export function RisksIssuesQueueRail({ activeId }: { activeId?: string }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const params = React.useMemo(() => parseRIParams(searchParams), [searchParams])
  const myId = React.useMemo(() => getCurrentUser(), [])?.userId

  const { data: risks = [] } = useQuery({ queryKey: ["risks"], queryFn: async () => (await api.get<Risk[]>("/risks")).data, staleTime: STALE_TIME })
  const { data: issues = [] } = useQuery({ queryKey: ["issues"], queryFn: async () => (await api.get<Issue[]>("/issues")).data, staleTime: STALE_TIME })

  const items = React.useMemo(
    () => buildUnifiedRows(risks, issues, params, myId),
    [risks, issues, params, myId],
  )

  const search = searchParams.toString()
  const toList = () => navigate({ pathname: "/risks-issues", search })
  const openRecord = (r: UnifiedRow) => navigate({ pathname: r.detailPath, search }, { replace: true })

  return (
    <>
      {/* Back-to-list header — returns to the same filtered grid. */}
      <Box
        role="button"
        tabIndex={0}
        aria-label="Back to list"
        onClick={toList}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toList() } }}
        sx={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 0.75,
          px: 1.5, height: 44,   // match the detail header height so the separators align
          cursor: "pointer",
          borderBottom: 1, borderColor: "divider",
          color: "#475569",
          transition: "background-color 0.12s",
          "&:hover": { bgcolor: "#f1f5f9" },
        }}
      >
        <ArrowBackIcon sx={{ fontSize: 16 }} />
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          List
        </Typography>
        <Typography sx={{ ml: "auto", fontSize: 11, color: "#94a3b8" }}>{items.length}</Typography>
      </Box>

      {/* Scrollable record list. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {items.map(r => {
          const active = r.rawId === activeId
          // Dot reads the SAME intent mapping the detail/grid pills use, but the
          // SOLID (saturated) scale rather than the pastel fill — at 8px the soft
          // pill colour is near-invisible between intents (see ServiceDeskQueueRail).
          const dotColor = statusSolid(r.status)
          return (
            <Box
              key={r.id}
              role="button"
              tabIndex={0}
              aria-current={active ? "true" : undefined}
              onClick={() => openRecord(r)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRecord(r) } }}
              sx={{
                display: "flex", alignItems: "flex-start", gap: 1,
                px: 1.5, py: 1.5,
                cursor: "pointer",
                borderBottom: "1px solid #f1f5f9",
                borderLeft: "3px solid", borderLeftColor: active ? "primary.main" : "transparent",
                bgcolor: active ? "#eff4ff" : "transparent",
                transition: "background-color 0.12s",
                "&:hover": { bgcolor: active ? "#eff4ff" : "#f8fafc" },
              }}
            >
              <Box
                component="span"
                sx={{ mt: "5px", width: 8, height: 8, borderRadius: "50%", bgcolor: dotColor, flexShrink: 0 }}
              />
              <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
                {/* Primary: title. Secondary: type (left, truncates) + created date
                    (right). Status is carried by the dot; reference lives in the
                    breadcrumb + the Details panel. */}
                <Typography
                  title={r.title}
                  variant="body2"
                  sx={{
                    color: active ? "primary.main" : "#0f172a",
                    fontWeight: active ? 600 : 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {r.title}
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, minWidth: 0 }}>
                  <Typography
                    title={KIND_LABEL[r.kind]}
                    sx={{
                      fontSize: 11, color: "text.tertiary", minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {KIND_LABEL[r.kind]}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "text.tertiary", flexShrink: 0 }}>
                    {formatCreated(r.createdAt)}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          )
        })}
      </Box>
    </>
  )
}
