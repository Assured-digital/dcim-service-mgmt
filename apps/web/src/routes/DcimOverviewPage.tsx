import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Alert, Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material"
import { api } from "../lib/api"
import { EmptyState, LoadingState } from "../components/PageState"

type SiteSummary = { id: string }
type AssetSummary = { id: string; lifecycleState: string }
type CheckSummary = { id: string; status: string }
type MaintenanceSummary = { id: string; workType: string; performedAt: string; nextDueAt: string | null }
type ConnectionSummary = { id: string; status: string }

function MetricCard({
  label,
  value,
  detail
}: {
  label: string
  value: string | number
  detail?: string
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            mb: 1
          }}
        >
          {label}
        </Typography>
        <Typography sx={{ fontSize: 30, fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>
          {value}
        </Typography>
        {detail ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {detail}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function DcimOverviewPage() {
  const sites = useQuery({
    queryKey: ["dcim-overview", "sites"],
    queryFn: async () => (await api.get<SiteSummary[]>("/sites")).data
  })

  const assets = useQuery({
    queryKey: ["dcim-overview", "assets"],
    queryFn: async () => (await api.get<AssetSummary[]>("/assets")).data
  })

  const checks = useQuery({
    queryKey: ["dcim-overview", "checks"],
    queryFn: async () => (await api.get<CheckSummary[]>("/checks")).data
  })

  const maintenance = useQuery({
    queryKey: ["dcim-overview", "maintenance"],
    queryFn: async () => (await api.get<MaintenanceSummary[]>("/maintenance")).data
  })

  const connections = useQuery({
    queryKey: ["dcim-overview", "connections"],
    queryFn: async () => (await api.get<ConnectionSummary[]>("/connections")).data
  })

  const isLoading =
    sites.isLoading ||
    assets.isLoading ||
    checks.isLoading ||
    maintenance.isLoading ||
    connections.isLoading

  if (isLoading) return <LoadingState />

  const hasError =
    sites.isError ||
    assets.isError ||
    checks.isError ||
    maintenance.isError ||
    connections.isError

  if (hasError) {
    return (
      <Alert severity="error">
        Failed to load one or more DCIM overview datasets. Ensure maintenance and connections APIs are available.
      </Alert>
    )
  }

  const siteCount = (sites.data ?? []).length
  const assetList = assets.data ?? []
  const checkList = checks.data ?? []
  const maintenanceList = maintenance.data ?? []
  const connectionList = connections.data ?? []

  const activeAssets = assetList.filter((a) => a.lifecycleState === "ACTIVE").length
  const inProgressChecks = checkList.filter((c) => c.status === "IN_PROGRESS").length
  const pendingReviewChecks = checkList.filter((c) => c.status === "PENDING_REVIEW").length
  const maintenanceDue = maintenanceList.filter((m) => m.nextDueAt && new Date(m.nextDueAt) <= new Date()).length
  const activeConnections = connectionList.filter((c) => c.status === "ACTIVE").length

  if (
    siteCount === 0 &&
    assetList.length === 0 &&
    checkList.length === 0 &&
    maintenanceList.length === 0 &&
    connectionList.length === 0
  ) {
    return (
      <EmptyState
        title="No DCIM data yet"
        detail="Add sites, assets, maintenance records, and connections to populate the overview."
      />
    )
  }

  return (
    <Box>
      <Stack spacing={2.5}>
        <Typography variant="body2" color="text.secondary">
          Operational snapshot across estate, field work execution, maintenance, and connectivity.
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <MetricCard label="Sites" value={siteCount} detail="Managed data centre sites in current client scope." />
          </Grid>
          <Grid item xs={12} md={4}>
            <MetricCard
              label="Assets"
              value={assetList.length}
              detail={`${activeAssets} active across all monitored locations.`}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <MetricCard
              label="Field Work"
              value={checkList.length}
              detail={`${inProgressChecks} in progress, ${pendingReviewChecks} pending review.`}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <MetricCard
              label="Maintenance Records"
              value={maintenanceList.length}
              detail={`${maintenanceDue} due or overdue based on next due date.`}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <MetricCard
              label="Connections"
              value={connectionList.length}
              detail={`${activeConnections} active links between managed assets.`}
            />
          </Grid>
        </Grid>
      </Stack>
    </Box>
  )
}
