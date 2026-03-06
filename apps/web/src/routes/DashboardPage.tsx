import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import InsightsIcon from "@mui/icons-material/Insights";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { ErrorState, LoadingState } from "../components/PageState";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";

type Assignee = { id: string; email: string };

type SR = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assigneeId?: string | null;
  assignee?: Assignee | null;
};

type Incident = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assigneeId?: string | null;
  assignee?: Assignee | null;
};

type Task = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assigneeId?: string | null;
  assignee?: Assignee | null;
};

type Asset = { id: string };
type Survey = { id: string; status: string };
type TriageItem = { id: string; status: string };

type TrendMetric = {
  label: string;
  opened: number;
  resolved: number;
  tone: string;
};

function formatDateForInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateForLabel(value: string) {
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function inDateRange(value: string, dateFrom: string, dateTo: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const from = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : null;
  const to = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null;

  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function countOpenedResolved<T extends { status: string; createdAt: string; updatedAt: string }>(
  items: T[],
  dateFrom: string,
  dateTo: string,
  resolvedStatuses: string[]
) {
  const opened = items.filter((x) => inDateRange(x.createdAt, dateFrom, dateTo)).length;
  const resolved = items.filter(
    (x) => resolvedStatuses.includes(x.status) && inDateRange(x.updatedAt, dateFrom, dateTo)
  ).length;
  return { opened, resolved };
}

function getDateRangeFromPreset(preset: "7d" | "30d" | "90d" | "ytd") {
  const now = new Date();
  const to = formatDateForInput(now);
  if (preset === "ytd") {
    return { from: `${now.getUTCFullYear()}-01-01`, to };
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const fromDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * days);
  return { from: formatDateForInput(fromDate), to };
}

export default function DashboardPage() {
  const canViewTriage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST]);
  const defaultRange = getDateRangeFromPreset("30d");
  const [dateFrom, setDateFrom] = React.useState(defaultRange.from);
  const [dateTo, setDateTo] = React.useState(defaultRange.to);
  const [assigneeId, setAssigneeId] = React.useState("");
  const [activePreset, setActivePreset] = React.useState<"7d" | "30d" | "90d" | "ytd">("30d");
  const [isExporting, setIsExporting] = React.useState<string | null>(null);

  const srs = useQuery({
    queryKey: ["srs"],
    queryFn: async () => (await api.get<SR[]>("/service-requests")).data
  });
  const incidents = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => (await api.get<Incident[]>("/incidents")).data
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data
  });
  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<Asset[]>("/assets")).data
  });
  const surveys = useQuery({
    queryKey: ["surveys"],
    queryFn: async () => (await api.get<Survey[]>("/surveys")).data
  });
  const triage = useQuery({
    queryKey: ["triage-queue"],
    enabled: canViewTriage,
    queryFn: async () => (await api.get<TriageItem[]>("/triage/queue")).data
  });

  const isLoading =
    srs.isLoading ||
    incidents.isLoading ||
    tasks.isLoading ||
    assets.isLoading ||
    surveys.isLoading ||
    (canViewTriage && triage.isLoading);
  const hasError =
    srs.error || incidents.error || tasks.error || assets.error || surveys.error || (canViewTriage && triage.error);

  const assignees = React.useMemo(() => {
    const byId = new Map<string, Assignee>();
    [...(srs.data ?? []), ...(incidents.data ?? []), ...(tasks.data ?? [])].forEach((item) => {
      if (item.assignee?.id && item.assignee?.email) byId.set(item.assignee.id, item.assignee);
    });
    return Array.from(byId.values()).sort((a, b) => a.email.localeCompare(b.email));
  }, [srs.data, incidents.data, tasks.data]);

  const selectedAssigneeLabel = React.useMemo(() => {
    if (!assigneeId) return "All assignees";
    return assignees.find((x) => x.id === assigneeId)?.email ?? "Unknown assignee";
  }, [assigneeId, assignees]);

  const applyAssignee = <T extends { assigneeId?: string | null }>(items: T[]) =>
    assigneeId ? items.filter((x) => x.assigneeId === assigneeId) : items;

  const filteredSrs = applyAssignee(srs.data ?? []);
  const filteredIncidents = applyAssignee(incidents.data ?? []);
  const filteredTasks = applyAssignee(tasks.data ?? []);

  const srTrend = countOpenedResolved(filteredSrs, dateFrom, dateTo, ["COMPLETED", "CLOSED"]);
  const incidentTrend = countOpenedResolved(filteredIncidents, dateFrom, dateTo, ["RESOLVED", "CLOSED"]);
  const taskTrend = countOpenedResolved(filteredTasks, dateFrom, dateTo, ["DONE"]);

  const triageInbox = canViewTriage ? (triage.data ?? []).filter((x) => x.status === "NEW").length : 0;
  const openTickets = filteredSrs.filter(
    (x) => x.status !== "CLOSED" && inDateRange(x.createdAt, dateFrom, dateTo)
  ).length;
  const openIncidents = filteredIncidents.filter(
    (x) => inDateRange(x.createdAt, dateFrom, dateTo) && !["RESOLVED", "CLOSED"].includes(x.status)
  ).length;
  const openTasks = filteredTasks.filter(
    (x) => inDateRange(x.createdAt, dateFrom, dateTo) && !["DONE"].includes(x.status)
  ).length;
  const activeSurveys = (surveys.data ?? []).filter((x) => x.status !== "COMPLETED").length;

  const trendCards: TrendMetric[] = [
    { label: "Service Requests", opened: srTrend.opened, resolved: srTrend.resolved, tone: "#2563eb" },
    { label: "Incidents", opened: incidentTrend.opened, resolved: incidentTrend.resolved, tone: "#dc2626" },
    { label: "Tasks", opened: taskTrend.opened, resolved: taskTrend.resolved, tone: "#0f766e" }
  ];

  const cards = [
    ...(canViewTriage
      ? [{ label: "Triage Inbox", value: triageInbox, tone: "#f59e0b", description: "Items waiting for triage." }]
      : []),
    { label: "Open Service Requests", value: openTickets, tone: "#2563eb", description: "Not closed in period." },
    { label: "Open Incidents", value: openIncidents, tone: "#dc2626", description: "Active incident workload." },
    { label: "Open Tasks", value: openTasks, tone: "#0f766e", description: "Tasks still in progress." },
    { label: "Assets", value: assets.data?.length ?? 0, tone: "#0891b2", description: "Assets in current scope." },
    { label: "Active Surveys", value: activeSurveys, tone: "#7c3aed", description: "Surveys not completed." }
  ];

  function applyPreset(preset: "7d" | "30d" | "90d" | "ytd") {
    const range = getDateRangeFromPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setActivePreset(preset);
  }

  function resetFilters() {
    const range = getDateRangeFromPreset("30d");
    setDateFrom(range.from);
    setDateTo(range.to);
    setAssigneeId("");
    setActivePreset("30d");
  }

  async function exportCsv(kind: "service-requests" | "incidents" | "tasks") {
    try {
      setIsExporting(kind);
      const res = await api.get<Blob>(`/${kind}/export`, {
        params: {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          assigneeId: assigneeId || undefined
        },
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <Box>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", lg: "center" }}
        sx={{ mb: 1.5 }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Operational pulse with fast filters, trend visibility, and one-click report exports.
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={() => exportCsv("service-requests")}
            disabled={isExporting !== null}
          >
            Export SRs
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={() => exportCsv("incidents")}
            disabled={isExporting !== null}
          >
            Export Incidents
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={() => exportCsv("tasks")}
            disabled={isExporting !== null}
          >
            Export Tasks
          </Button>
        </Stack>
      </Stack>

      <Card
        sx={{
          mb: 2,
          border: "1px solid #dbe4f1",
          background:
            "linear-gradient(130deg, rgba(255,255,255,1) 0%, rgba(248,250,252,0.96) 70%, rgba(239,246,255,0.9) 100%)"
        }}
      >
        <CardContent>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} justifyContent="space-between">
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
              <TextField
                type="date"
                label="From"
                InputLabelProps={{ shrink: true }}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset("30d");
                }}
              />
              <TextField
                type="date"
                label="To"
                InputLabelProps={{ shrink: true }}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset("30d");
                }}
              />
              <TextField
                select
                label="Assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                sx={{ minWidth: 260 }}
              >
                <MenuItem value="">All assignees</MenuItem>
                {assignees.map((assignee) => (
                  <MenuItem key={assignee.id} value={assignee.id}>
                    {assignee.email}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <ButtonGroup variant="outlined" size="small" aria-label="Quick date presets">
                <Button
                  variant={activePreset === "7d" ? "contained" : "outlined"}
                  onClick={() => applyPreset("7d")}
                >
                  7D
                </Button>
                <Button
                  variant={activePreset === "30d" ? "contained" : "outlined"}
                  onClick={() => applyPreset("30d")}
                >
                  30D
                </Button>
                <Button
                  variant={activePreset === "90d" ? "contained" : "outlined"}
                  onClick={() => applyPreset("90d")}
                >
                  90D
                </Button>
                <Button
                  variant={activePreset === "ytd" ? "contained" : "outlined"}
                  onClick={() => applyPreset("ytd")}
                >
                  YTD
                </Button>
              </ButtonGroup>
              <Button variant="text" size="small" onClick={resetFilters}>
                Reset
              </Button>
            </Stack>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mt: 1.5 }}>
            <Chip
              icon={<FilterAltIcon />}
              label={`Period: ${formatDateForLabel(dateFrom)} to ${formatDateForLabel(dateTo)}`}
              size="small"
              sx={{ bgcolor: "#eef2ff", border: "1px solid #c7d2fe" }}
            />
            <Chip
              label={`Assignee: ${selectedAssigneeLabel}`}
              size="small"
              sx={{ bgcolor: "#f1f5f9", border: "1px solid #cbd5e1" }}
            />
          </Stack>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState label="Refreshing dashboard metrics..." /> : null}
      {hasError ? <ErrorState title="Failed to load dashboard metrics" /> : null}

      {!isLoading && !hasError ? (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <InsightsIcon sx={{ color: "#334155", fontSize: 20 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e293b" }}>
              Trend Snapshot
            </Typography>
            <Tooltip title="Opened is counted by created date. Resolved is counted by latest status date within the selected period.">
              <Chip label="How this works" size="small" variant="outlined" />
            </Tooltip>
          </Stack>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            {trendCards.map((metric, idx) => {
              const total = metric.opened + metric.resolved;
              const resolvedPct = total > 0 ? Math.round((metric.resolved / total) * 100) : 0;

              return (
                <Grid item xs={12} md={4} key={metric.label}>
                  <Card
                    sx={{
                      border: `1px solid ${alpha(metric.tone, 0.22)}`,
                      background: `linear-gradient(135deg, ${alpha(metric.tone, 0.07)} 0%, #ffffff 55%)`,
                      animation: "fadeUp 420ms ease both",
                      animationDelay: `${idx * 70}ms`,
                      "@keyframes fadeUp": {
                        from: { opacity: 0, transform: "translateY(10px)" },
                        to: { opacity: 1, transform: "translateY(0)" }
                      }
                    }}
                  >
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary">
                        {metric.label}
                      </Typography>
                      <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Opened
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800 }}>
                            {metric.opened}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Resolved
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800 }}>
                            {metric.resolved}
                          </Typography>
                        </Box>
                      </Stack>
                      <Box sx={{ mt: 1.2 }}>
                        <LinearProgress
                          variant="determinate"
                          value={resolvedPct}
                          sx={{
                            height: 8,
                            borderRadius: 99,
                            bgcolor: "#e2e8f0",
                            "& .MuiLinearProgress-bar": { bgcolor: metric.tone }
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Resolution share: {resolvedPct}%
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1e293b", mb: 1 }}>
            Current Snapshot
          </Typography>
          <Grid container spacing={2}>
            {cards.map((card, idx) => (
              <Grid item xs={12} sm={6} md={4} lg={2.4 as any} key={card.label}>
                <Card
                  sx={{
                    overflow: "hidden",
                    border: `1px solid ${alpha(card.tone, 0.2)}`,
                    background: `radial-gradient(circle at top right, ${alpha(card.tone, 0.18)} 0%, #ffffff 55%)`,
                    transition: "transform 180ms ease, box-shadow 180ms ease",
                    animation: "fadeUp 420ms ease both",
                    animationDelay: `${idx * 60}ms`,
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: "0 10px 24px rgba(15,23,42,0.09)"
                    }
                  }}
                >
                  <Box sx={{ height: 4, bgcolor: card.tone }} />
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2" sx={{ color: "#334155" }}>
                        {card.label}
                      </Typography>
                      <TrendingUpIcon sx={{ color: card.tone, fontSize: 18 }} />
                    </Stack>
                    <Typography variant="h4" sx={{ mt: 1.2, fontWeight: 800 }}>
                      {card.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {card.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      ) : null}
    </Box>
  );
}
