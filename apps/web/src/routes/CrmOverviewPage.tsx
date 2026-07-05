import React from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Box, Button, Card, Chip, Stack, Typography } from "@mui/material"
import PersonOutlineIcon from "@mui/icons-material/PersonOutline"
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined"
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined"
import AutorenewIcon from "@mui/icons-material/Autorenew"
import BoltIcon from "@mui/icons-material/Bolt"
import { ErrorState, LoadingState } from "../components/PageState"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES } from "../lib/rbac"
import {
  ACTIVITY_TYPE_LABELS, LIFECYCLE_STAGE_LABELS, OPPORTUNITY_STAGE_LABELS, QUOTE_STATUS_LABELS,
  contactDisplayName, formatMoney, getAccountOverview, getRenewals, runCrmSweep
} from "../lib/crm"
import { daysUntilRenewal } from "../lib/workPackages"

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "danger" | "warn" | "muted" }) {
  const color = tone === "danger" ? "#dc2626" : tone === "warn" ? "#a16207" : undefined
  return (
    <Card sx={{ p: 1.5, flex: "1 1 150px", minWidth: 140 }}>
      <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700, color, mt: 0.25 }}>{value}</Typography>
    </Card>
  )
}

export default function CrmOverviewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const isOrgSuper = hasAnyRole([...ORG_SUPER_ROLES])

  const overview = useQuery({ queryKey: ["crm-overview"], queryFn: getAccountOverview })
  const renewals = useQuery({ queryKey: ["crm-renewals", 90], queryFn: () => getRenewals(90) })

  const sweep = useMutation({
    mutationFn: runCrmSweep,
    onSuccess: r => {
      notify.success(`Sweep done — ${r.renewalOppsCreated} renewals, ${r.stalledNudges + r.staleQuoteNudges} nudges across ${r.clientsSwept} clients`)
      qc.invalidateQueries({ queryKey: ["crm-overview"] })
      qc.invalidateQueries({ queryKey: ["opportunities"] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: () => notify.error("Sweep failed"),
  })

  if (overview.isLoading) return <LoadingState />
  if (overview.isError || !overview.data) return <ErrorState title="Failed to load account overview" />
  const o = overview.data
  const contact = o.primaryContact

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{o.client?.name ?? "Account"}</Typography>
          {o.client ? (
            <Chip size="small" label={LIFECYCLE_STAGE_LABELS[o.client.lifecycleStage] ?? o.client.lifecycleStage}
              sx={{ fontSize: 11.5, height: 22, textTransform: "capitalize" }} />
          ) : null}
        </Box>
        {isOrgSuper ? (
          <Button size="small" variant="outlined" startIcon={<BoltIcon sx={{ fontSize: 16 }} />}
            disabled={sweep.isPending} onClick={() => sweep.mutate()}>
            {sweep.isPending ? "Sweeping…" : "Run CRM sweep"}
          </Button>
        ) : null}
      </Box>

      {/* Health signals — raw numbers, not a composite score */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: "wrap" }} useFlexGap>
        <Kpi label="Open opportunities" value={o.pipeline.count} />
        {o.pipeline.weightedValue !== undefined ? (
          <Kpi label="Weighted pipeline" value={formatMoney(o.pipeline.weightedValue) ?? "£0"} />
        ) : null}
        <Kpi label="Days since contact"
          value={o.health.daysSinceLastActivity ?? "—"}
          tone={o.health.daysSinceLastActivity !== null && o.health.daysSinceLastActivity > 30 ? "warn" : undefined} />
        <Kpi label="Open incidents" value={o.health.openIncidents}
          tone={o.health.openIncidents > 0 ? "danger" : undefined} />
        <Kpi label="Open requests" value={o.health.openServiceRequests} />
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        {/* Primary contact */}
        <Card sx={{ p: 2 }}>
          <PanelTitle>Primary contact</PanelTitle>
          {contact ? (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PersonOutlineIcon sx={{ fontSize: 18, color: "var(--color-text-muted)" }} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{contactDisplayName(contact)}</Typography>
                {contact.jobTitle ? <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>· {contact.jobTitle}</Typography> : null}
              </Box>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {contact.email ? <IconLine icon={<EmailOutlinedIcon sx={{ fontSize: 15 }} />} text={contact.email} /> : null}
                {contact.phone || contact.mobile ? <IconLine icon={<PhoneOutlinedIcon sx={{ fontSize: 15 }} />} text={[contact.phone, contact.mobile].filter(Boolean).join(" · ")} /> : null}
              </Stack>
              <Button size="small" sx={{ mt: 1 }} onClick={() => navigate("/crm/contacts")}>All contacts</Button>
            </Box>
          ) : (
            <EmptyLine text="No primary contact set." action="Add contacts" onClick={() => navigate("/crm/contacts")} />
          )}
        </Card>

        {/* Next renewal */}
        <Card sx={{ p: 2 }}>
          <PanelTitle>Next renewal</PanelTitle>
          {o.nextRenewal ? (
            <Box onClick={() => navigate(`/work-packages/${o.nextRenewal!.id}`)} sx={{ cursor: "pointer" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <AutorenewIcon sx={{ fontSize: 17, color: "#a16207" }} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{o.nextRenewal.reference}</Typography>
                <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  {new Date(o.nextRenewal.renewalDate).toLocaleDateString("en-GB")}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 13, mt: 0.5 }}>{o.nextRenewal.title}</Typography>
            </Box>
          ) : (
            <EmptyLine text="No upcoming renewals." />
          )}
        </Card>

        {/* Open opportunities */}
        <Card sx={{ p: 2 }}>
          <PanelTitle onAll={() => navigate("/crm/pipeline")}>Open opportunities</PanelTitle>
          {o.pipeline.open.length === 0 ? <EmptyLine text="No open deals." action="Pipeline" onClick={() => navigate("/crm/pipeline")} /> : (
            <Stack spacing={0.5}>
              {o.pipeline.open.slice(0, 5).map(op => (
                <Box key={op.id} onClick={() => navigate(`/crm/opportunities/${op.id}`)}
                  sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.6, borderRadius: "6px", cursor: "pointer", "&:hover": { bgcolor: "rgba(29,78,216,0.05)" } }}>
                  <StatusPill intent={entityStatusIntent(op.stage)} label={OPPORTUNITY_STAGE_LABELS[op.stage] ?? op.stage} size="sm" />
                  <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{op.title}</Typography>
                  {op.value !== undefined && op.value !== null ? (
                    <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#1d4ed8" }}>{formatMoney(op.value)}</Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          )}
        </Card>

        {/* Recent activity */}
        <Card sx={{ p: 2 }}>
          <PanelTitle onAll={() => navigate("/crm/activity")}>Recent activity</PanelTitle>
          {o.recentActivity.length === 0 ? <EmptyLine text="Nothing logged yet." action="Log activity" onClick={() => navigate("/crm/activity")} /> : (
            <Stack spacing={0.75}>
              {o.recentActivity.map(a => (
                <Box key={a.id} sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                  <Chip size="small" label={ACTIVITY_TYPE_LABELS[a.type] ?? a.type} sx={{ fontSize: 10, height: 17 }} />
                  <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{a.subject}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                    {new Date(a.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Card>

        {/* Open quotes */}
        <Card sx={{ p: 2 }}>
          <PanelTitle onAll={() => navigate("/crm/quotes")}>Open quotes</PanelTitle>
          {o.quotes.length === 0 ? <EmptyLine text="No open quotes." action="Quotes" onClick={() => navigate("/crm/quotes")} /> : (
            <Stack spacing={0.5}>
              {o.quotes.slice(0, 5).map(q => (
                <Box key={q.id} onClick={() => navigate(`/crm/quotes/${q.id}`)}
                  sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.6, borderRadius: "6px", cursor: "pointer", "&:hover": { bgcolor: "rgba(29,78,216,0.05)" } }}>
                  <StatusPill intent={entityStatusIntent(q.status)} label={QUOTE_STATUS_LABELS[q.status] ?? q.status} size="sm" />
                  <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{q.title}</Typography>
                  {q.value !== undefined && q.value !== null ? (
                    <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{formatMoney(q.value)}</Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          )}
        </Card>

        {/* Renewals due 90 days */}
        <Card sx={{ p: 2 }}>
          <PanelTitle>Renewals due (90 days)</PanelTitle>
          {(renewals.data ?? []).length === 0 ? <EmptyLine text="Nothing due in the next 90 days." /> : (
            <Stack spacing={0.5}>
              {(renewals.data ?? []).map(r => {
                const days = daysUntilRenewal(r)
                return (
                  <Box key={r.id} onClick={() => navigate(`/work-packages/${r.id}`)}
                    sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.6, borderRadius: "6px", cursor: "pointer", "&:hover": { bgcolor: "rgba(29,78,216,0.05)" } }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, fontFamily: "monospace" }}>{r.reference}</Typography>
                    <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{r.title}</Typography>
                    <Chip size="small" label={days !== null && days < 0 ? `${-days}d overdue` : `${days}d`}
                      sx={{ fontSize: 10.5, height: 18, bgcolor: days !== null && days < 0 ? "rgba(220,38,38,0.1)" : "rgba(234,179,8,0.12)", color: days !== null && days < 0 ? "#dc2626" : "#a16207" }} />
                  </Box>
                )
              })}
            </Stack>
          )}
        </Card>
      </Box>
    </Box>
  )
}

function PanelTitle({ children, onAll }: { children: React.ReactNode; onAll?: () => void }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{children}</Typography>
      {onAll ? <Button size="small" sx={{ fontSize: 11.5, minWidth: 0, py: 0 }} onClick={onAll}>View all</Button> : null}
    </Box>
  )
}

function IconLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "var(--color-text-muted)" }}>
      {icon}<Typography sx={{ fontSize: 12.5 }}>{text}</Typography>
    </Box>
  )
}

function EmptyLine({ text, action, onClick }: { text: string; action?: string; onClick?: () => void }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>{text}</Typography>
      {action ? <Button size="small" sx={{ fontSize: 11.5 }} onClick={onClick}>{action}</Button> : null}
    </Box>
  )
}
