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
const RAG_COLOURS = {
  green: "#22c55e",
  amber: "#f59e0b",
  red:   "#ef4444"
}

function RagDot({ rag }: { rag: "red" | "amber" | "green" }) {
  return (
    <Box sx={{
      width: 10, height: 10, borderRadius: "50%",
      bgcolor: RAG_COLOURS[rag], flexShrink: 0
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
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        p: "16px",
        cursor: "pointer",
        transition: "all 0.12s",
        "&:hover": {
          borderColor: "#cbd5e1",
          boxShadow: "0 1px 4px rgba(15,23,42,0.06)"
        }
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "12px" }}>
        <RagDot rag={stat.rag} />
        <Typography variant="body1" sx={{ fontWeight: 500, color: "#0f172a" }}>
          {stat.client.name}
        </Typography>
      </Stack>

      {/* Stats */}
      <Box sx={{ fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>
        <Box>
          {stat.openSRs} open SR · {" "}
          <span style={{ color: stat.openIncidents > 0 ? "#64748b" : "#64748b" }}>
            {stat.openIncidents} incident{stat.openIncidents !== 1 ? "s" : ""}
          </span>
          {" · "}
          <span style={{ color: stat.overdueTasks > 0 ? "#b45309" : "#64748b", fontWeight: stat.overdueTasks > 0 ? 500 : 400 }}>
            {stat.overdueTasks} overdue
          </span>
        </Box>
        {stat.pendingReviewChecks > 0 ? (
          <Box>
            <span style={{
              color: stat.oldPendingChecks > 0 ? "#b91c1c" : "#b45309",
              fontWeight: 500
            }}>
              {stat.pendingReviewChecks} check{stat.pendingReviewChecks !== 1 ? "s" : ""} pending review
              {stat.oldPendingChecks > 0 ? " >3 days" : ""}
            </span>
          </Box>
        ) : null}
        {stat.criticalIncidents > 0 ? (
          <Box>
            <span style={{ color: "#b91c1c", fontWeight: 500 }}>
              {stat.criticalIncidents} critical incident{stat.criticalIncidents !== 1 ? "s" : ""}
            </span>
          </Box>
        ) : null}
      </Box>

      {/* Footer */}
      <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: "10px" }}>
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
  return (
    <Box
      sx={{
        display: "flex", alignItems: "center", gap: "10px",
        px: "14px", py: "11px",
        bgcolor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderLeft: `3px solid ${item.severity === "red" ? "#ef4444" : "#f59e0b"}`,
        borderRadius: "8px",
        mb: "6px",
        transition: "all 0.12s",
        "&:hover": { borderColor: item.severity === "red" ? "#ef4444" : "#f59e0b", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }
      }}
    >
      <Box sx={{
        width: 8, height: 8, borderRadius: "50%",
        bgcolor: item.severity === "red" ? "#ef4444" : "#f59e0b", flexShrink: 0
      }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, color: "#334155", lineHeight: 1.4 }}>
          {item.message}{" — "}
          <span style={{ fontWeight: 500 }}>{item.clientName}</span>
          {item.reference ? (
            <span style={{ color: "#94a3b8" }}> · {item.reference}</span>
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
      goToClient(item.entityId, `/incidents/${item.entityId}`)
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
      {/* Page header */}
      <Box sx={{ mb: "24px" }}>
        <Typography variant="h4" sx={{ fontWeight: 400, lineHeight: 1.2 }}>
          Operations Overview
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: "4px" }}>
          Portfolio health across all clients
        </Typography>
      </Box>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load overview" /> : null}

      {data ? (
        <>
          {/* Attention banner */}
          {attentionCount > 0 ? (
            <Box sx={{
              bgcolor: redCount > 0 ? "#fff7ed" : "#fffbeb",
              border: `1px solid ${redCount > 0 ? "#fed7aa" : "#fde68a"}`,
              borderRadius: "8px",
              px: "16px", py: "12px",
              mb: "28px",
              display: "flex", alignItems: "flex-start", gap: "10px"
            }}>
              <WarningAmberIcon sx={{
                fontSize: 17, flexShrink: 0, mt: "1px",
                color: redCount > 0 ? "#c2410c" : "#92400e"
              }} />
              <Typography sx={{
                fontSize: 13, lineHeight: 1.6,
                color: redCount > 0 ? "#9a3412" : "#92400e"
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
          ) : (
            <Box sx={{
              bgcolor: "#f0fdf4", border: "1px solid #bbf7d0",
              borderRadius: "8px", px: "16px", py: "12px", mb: "28px",
              display: "flex", alignItems: "center", gap: "10px"
            }}>
              <Typography sx={{ fontSize: 13, color: "#166534" }}>
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