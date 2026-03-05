import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";

type SR = { id: string; status: string };
type Incident = { id: string; status: string };
type Task = { id: string; status: string };
type Asset = { id: string };
type Survey = { id: string; status: string };
type Submission = { id: string; status: string };

export default function DashboardPage() {
  const srs = useQuery({ queryKey: ["srs"], queryFn: async () => (await api.get<SR[]>("/service-requests")).data });
  const incidents = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => (await api.get<Incident[]>("/incidents")).data
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data
  });
  const assets = useQuery({ queryKey: ["assets"], queryFn: async () => (await api.get<Asset[]>("/assets")).data });
  const surveys = useQuery({ queryKey: ["surveys"], queryFn: async () => (await api.get<Survey[]>("/surveys")).data });
  const triage = useQuery({
    queryKey: ["triage-submissions"],
    queryFn: async () => (await api.get<Submission[]>("/public-submissions")).data
  });

  const triageInbox = (triage.data ?? []).filter((x) => x.status === "NEW").length;
  const openTickets = (srs.data ?? []).filter((x) => x.status !== "CLOSED").length;
  const openIncidents = (incidents.data ?? []).filter(
    (x) => !["RESOLVED", "CLOSED"].includes(x.status)
  ).length;
  const openTasks = (tasks.data ?? []).filter((x) => !["DONE"].includes(x.status)).length;
  const activeSurveys = (surveys.data ?? []).filter((x) => x.status !== "COMPLETED").length;

  const cards = [
    { label: "Triage Inbox", value: triageInbox, tone: "#f59e0b" },
    { label: "Open Tickets", value: openTickets, tone: "#2563eb" },
    { label: "Open Incidents", value: openIncidents, tone: "#dc2626" },
    { label: "Open Tasks", value: openTasks, tone: "#0f766e" },
    { label: "Assets", value: assets.data?.length ?? 0, tone: "#0f766e" },
    { label: "Active Surveys", value: activeSurveys, tone: "#7c3aed" }
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
        Live operational pulse across service desk, infrastructure assets, and audits.
      </Typography>
      <Grid container spacing={2}>
        {cards.map((c) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4 as any} key={c.label}>
            <Card sx={{ overflow: "hidden" }}>
              <Box sx={{ height: 4, bgcolor: c.tone }} />
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>
                    {c.label}
                  </Typography>
                  <TrendingUpIcon sx={{ color: c.tone, fontSize: 18 }} />
                </Stack>
                <Typography variant="h4" sx={{ mt: 1.2, fontWeight: 800 }}>
                  {c.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
