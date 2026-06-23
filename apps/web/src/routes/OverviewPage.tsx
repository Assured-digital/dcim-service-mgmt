import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { setSelectedClientId } from "../lib/scope"
import {
  Box, Stack, Typography
} from "@mui/material"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import { LoadingState, ErrorState } from "../components/PageState"
import { SectionHeader } from "../components/shared/primitives/SectionHeader"
import { semanticToken, ragToken, slate, type ThemeMode } from "../components/shared"
import { useThemeMode } from "../lib/theme"

// ── Mode-aware washes (file-local, 2b pattern) ──────────────────────────────
// Light branch = exact prior hex (documented exception); dark = a translucent tint
// that stays a readable banner on the dark surface. amberWash mirrors the amber
// "needs attention" band; attentionWash is the louder red/orange variant; the
// all-clear keeps its bespoke green (text #166534 kept literal per sign-off).
function amberWash(mode: ThemeMode) {
  return mode === "dark"
    ? { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.30)", icon: "#fbbf24", text: "#fbbf24" }
    : { bg: "#fffbeb", border: "#fde68a", icon: "#92400e", text: "#92400e" }
}
function attentionWash(mode: ThemeMode) {
  return mode === "dark"
    ? { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.30)", icon: "#fdba74", text: "#fdba74" }
    : { bg: "#fff7ed", border: "#fed7aa", icon: "#c2410c", text: "#9a3412" }
}
function successWash(mode: ThemeMode) {
  return mode === "dark"
    ? { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.30)", text: "#4ade80" }
    : { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" }
}

// ── Types ─────────────────────────────────────────────────────────────────
type ClientStat = {
  client: { id: string; name: string }
  rag: "red" | "amber" | "green"
  openSRs: number
  openIncidents: number
  criticalIncidents: number
  overdueTasks: number
  pendingReviewChecks: number
  oldPendingChecks: number
  lastActivity: string | null
}

type AttentionItem = {
  severity: "red" | "amber"
  message: string
  clientName: string
  reference?: string
  entityType: string
  entityId: string
}

type OverviewData = {
  clientStats: ClientStat[]
  attentionItems: AttentionItem[]
}

// ── RAG dot ───────────────────────────────────────────────────────────────
function RagDot({ rag }: { rag: "red" | "amber" | "green" }) {
  const { mode } = useThemeMode()
  const dot = ragToken(rag === "red" ? "RED" : rag === "amber" ? "AMBER" : "GREEN", mode).dot
  return (
    <Box sx={{
      width: 10, height: 10, borderRadius: "50%",
      bgcolor: dot, flexShrink: 0
    }} />
  )
}

// ── Last activity ─────────────────────────────────────────────────────────
function lastActivityLabel(dateStr: string | null): string {
  if (!dateStr) return "No recent activity"
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `Last activity: ${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `Last activity: ${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  return `Last activity: ${days} day${days !== 1 ? "s" : ""} ago`
}

// ── Client health card ────────────────────────────────────────────────────
function ClientHealthCard({
  stat,
  onClick
}: {
  stat: ClientStat
  onClick: () => void
}) {
  const { mode } = useThemeMode()
  const warnText = semanticToken("warning", mode).text
  const dangerText = semanticToken("danger", mode).solid
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: "background.paper",
        border: "1px solid", borderColor: "divider",
        borderRadius: "8px",
        p: "16px",
        cursor: "pointer",
        transition: "all 0.12s",
        "&:hover": {
          borderColor: mode === "dark" ? slate[600] : slate[300],
          boxShadow: "0 1px 4px rgba(15,23,42,0.06)"
        }
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "12px" }}>
        <RagDot rag={stat.rag} />
        <Typography variant="body1" sx={{ fontWeight: 500, color: "text.primary" }}>
          {stat.client.name}
        </Typography>
      </Stack>

      {/* Stats */}
      <Box sx={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.8 }}>
        <Box>
          {stat.openSRs} open SR · {" "}
          <span style={{ color: "var(--color-text-muted)" }}>
            {stat.openIncidents} incident{stat.openIncidents !== 1 ? "s" : ""}
          </span>
          {" · "}
          <span style={{ color: stat.overdueTasks > 0 ? warnText : "var(--color-text-muted)", fontWeight: stat.overdueTasks > 0 ? 500 : 400 }}>
            {stat.overdueTasks} overdue
          </span>
        </Box>
        {stat.pendingReviewChecks > 0 ? (
          <Box>
            <span style={{
              color: stat.oldPendingChecks > 0 ? dangerText : warnText,
              fontWeight: 500
            }}>
              {stat.pendingReviewChecks} check{stat.pendingReviewChecks !== 1 ? "s" : ""} pending review
              {stat.oldPendingChecks > 0 ? " >3 days" : ""}
            </span>
          </Box>
        ) : null}
        {stat.criticalIncidents > 0 ? (
          <Box>
            <span style={{ color: dangerText, fontWeight: 500 }}>
              {stat.criticalIncidents} critical incident{stat.criticalIncidents !== 1 ? "s" : ""}
            </span>
          </Box>
        ) : null}
      </Box>

      {/* Footer */}
      <Typography sx={{ fontSize: 11, color: "text.tertiary", mt: "10px" }}>
        {lastActivityLabel(stat.lastActivity)}
      </Typography>
    </Box>
  )
}

// ── Attention row ─────────────────────────────────────────────────────────
function AttentionRow({
  item,
  onNavigate
}: {
  item: AttentionItem
  onNavigate: () => void
}) {
  const { mode } = useThemeMode()
  const accent = item.severity === "red" ? ragToken("RED", mode).dot : ragToken("AMBER", mode).dot
  return (
    <Box
      sx={{
        display: "flex", alignItems: "center", gap: "10px",
        px: "14px", py: "11px",
        bgcolor: "background.paper",
        border: "1px solid", borderColor: "divider",
        borderLeft: `3px solid ${accent}`,
        borderRadius: "8px",
        mb: "6px",
        transition: "all 0.12s",
        "&:hover": { borderColor: accent, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }
      }}
    >
      <Box sx={{
        width: 8, height: 8, borderRadius: "50%",
        bgcolor: accent, flexShrink: 0
      }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, color: mode === "dark" ? slate[300] : slate[700], lineHeight: 1.4 }}>
          {item.message}{" — "}
          <span style={{ fontWeight: 500 }}>{item.clientName}</span>
          {item.reference ? (
            <span style={{ color: "var(--color-text-tertiary)" }}> · {item.reference}</span>
          ) : null}
        </Typography>
      </Box>
      <Typography
        onClick={onNavigate}
        sx={{
          fontSize: 12, fontWeight: 500, color: "#2563eb",
          cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
          "&:hover": { textDecoration: "underline" }
        }}
      >
        {item.entityType === "incident" ? "View" :
         item.entityType === "check" ? "Review" : "View all"}
      </Typography>
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { mode } = useThemeMode()

  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: async () => (await api.get<OverviewData>("/overview")).data,
    refetchInterval: 60000 // refresh every minute
  })

  // Navigate to a client-scoped page
  function goToClient(clientId: string, path: string) {
    setSelectedClientId(clientId)
    queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" && q.queryKey[0] !== "overview" })
    navigate(path)
  }

  function handleAttentionNav(item: AttentionItem) {
    if (item.entityType === "incident") {
      const stat = data?.clientStats.find(s => s.client.name === item.clientName)
      if (stat) goToClient(stat.client.id, `/incidents/${item.entityId}`)
    } else if (item.entityType === "check") {
      // Find the client id from stats
      const stat = data?.clientStats.find(s => s.client.name === item.clientName)
      if (stat) goToClient(stat.client.id, `/checks/${item.entityId}`)
    } else if (item.entityType === "tasks") {
      goToClient(item.entityId, "/tasks")
    } else if (item.entityType === "checks") {
      goToClient(item.entityId, "/checks")
    }
  }

  // Attention banner count
  const attentionCount = data?.attentionItems.length ?? 0
  const redCount = data?.attentionItems.filter(i => i.severity === "red").length ?? 0

  return (
    <Box>
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load overview" /> : null}

      {data ? (
        <>
          {/* Attention banner */}
          {attentionCount > 0 ? (
            (() => {
              const banner = redCount > 0 ? attentionWash(mode) : amberWash(mode)
              return (
                <Box sx={{
                  bgcolor: banner.bg,
                  border: "1px solid", borderColor: banner.border,
                  borderRadius: "8px",
                  px: "16px", py: "12px",
                  mb: "28px",
                  display: "flex", alignItems: "flex-start", gap: "10px"
                }}>
                  <WarningAmberIcon sx={{
                    fontSize: 17, flexShrink: 0, mt: "1px",
                    color: banner.icon
                  }} />
                  <Typography sx={{
                    fontSize: 13, lineHeight: 1.6,
                    color: banner.text
                  }}>
                    <strong>{attentionCount} item{attentionCount !== 1 ? "s" : ""} need attention:</strong>{" "}
                    {data.attentionItems.map((item, i) => (
                      <span key={i}>
                        {i > 0 ? " · " : ""}
                        {item.message} ({item.clientName})
                      </span>
                    ))}
                  </Typography>
                </Box>
              )
            })()
          ) : (
            <Box sx={{
              bgcolor: successWash(mode).bg, border: "1px solid", borderColor: successWash(mode).border,
              borderRadius: "8px", px: "16px", py: "12px", mb: "28px",
              display: "flex", alignItems: "center", gap: "10px"
            }}>
              <Typography sx={{ fontSize: 13, color: successWash(mode).text }}>
                ✓ <strong>All clear</strong> — no attention items across all clients
              </Typography>
            </Box>
          )}

          {/* Client health grid */}
          <Box sx={{ mb: "28px" }}>
            <Box sx={{ mb: "12px", pb: "8px", borderBottom: "1px solid var(--color-border-primary)" }}>
              <SectionHeader label="Client Health" />
            </Box>
            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
              gap: "16px"
            }}>
              {data.clientStats.map(stat => (
                <ClientHealthCard
                  key={stat.client.id}
                  stat={stat}
                  onClick={() => goToClient(stat.client.id, "/dashboard")}
                />
              ))}
            </Box>
          </Box>

          {/* Attention required */}
          {data.attentionItems.length > 0 ? (
            <Box sx={{ mb: "28px" }}>
              <Box sx={{ mb: "12px", pb: "8px", borderBottom: "1px solid var(--color-border-primary)" }}>
                <SectionHeader
                  label="Attention Required"
                  action={<Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>({data.attentionItems.length})</Typography>}
                />
              </Box>
              {data.attentionItems.map((item, i) => (
                <AttentionRow
                  key={i}
                  item={item}
                  onNavigate={() => handleAttentionNav(item)}
                />
              ))}
            </Box>
          ) : null}

          {/* Empty state when no clients */}
          {data.clientStats.length === 0 ? (
            <Box sx={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", py: "64px", textAlign: "center"
            }}>
              <Typography variant="h6" sx={{ fontWeight: 500, mb: "6px" }}>
                No active clients
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Add clients in the Admin section to see portfolio health here.
              </Typography>
            </Box>
          ) : null}
        </>
      ) : null}
    </Box>
  )
}