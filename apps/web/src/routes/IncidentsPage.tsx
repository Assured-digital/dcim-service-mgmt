import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../lib/api";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { priorityChipSx, statusChipSx } from "../lib/ui";

type Incident = {
  id: string;
  reference: string;
  title: string;
  status: string;
  severity: string;
  priority: string;
  updatedAt: string;
};

const statusOptions = ["NEW", "INVESTIGATING", "MITIGATED", "RESOLVED", "CLOSED"];

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [priority, setPriority] = useState("medium");
  const [draftStatus, setDraftStatus] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => (await api.get<Incident[]>("/incidents")).data
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/incidents", {
          title,
          description,
          severity,
          priority
        })
      ).data,
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setSeverity("MEDIUM");
      setPriority("medium");
      await qc.invalidateQueries({ queryKey: ["incidents"] });
    }
  });

  const updateStatus = useMutation({
    mutationFn: async (payload: { id: string; status: string }) =>
      (await api.post(`/incidents/${payload.id}/status`, { status: payload.status })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["incidents"] });
    }
  });

  const mutationError = [create.error, updateStatus.error].find(Boolean) as ApiError | undefined;
  const mutationErrorMessage = Array.isArray(mutationError?.message)
    ? mutationError?.message.join(", ")
    : mutationError?.message;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Incidents
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Major operational issues with controlled lifecycle and severity tracking.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
            />
            <TextField select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)} sx={{ minWidth: 150 }}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} sx={{ minWidth: 140 }}>
              {["low", "medium", "high"].map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              onClick={() => create.mutate()}
              disabled={!title.trim() || description.trim().length < 10 || create.isPending}
            >
              Create
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {isLoading ? <Typography>Loading…</Typography> : null}
          {error ? <Alert severity="error">Failed to load incidents</Alert> : null}
          {mutationErrorMessage ? <Alert severity="error" sx={{ mb: 2 }}>{mutationErrorMessage}</Alert> : null}

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((inc) => {
                  const selected = draftStatus[inc.id] ?? inc.status;
                  return (
                    <TableRow key={inc.id}>
                      <TableCell sx={{ fontWeight: 700 }}>{inc.reference}</TableCell>
                      <TableCell>{inc.title}</TableCell>
                      <TableCell>
                        <Chip size="small" sx={statusChipSx(inc.status)} label={inc.status.toLowerCase()} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" sx={statusChipSx(inc.severity)} label={inc.severity.toLowerCase()} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" sx={priorityChipSx(inc.priority)} label={inc.priority} />
                      </TableCell>
                      <TableCell>{new Date(inc.updatedAt).toLocaleDateString()}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <TextField
                            select
                            size="small"
                            value={selected}
                            sx={{ minWidth: 150 }}
                            onChange={(e) => setDraftStatus((prev) => ({ ...prev, [inc.id]: e.target.value }))}
                          >
                            {statusOptions.map((s) => (
                              <MenuItem key={s} value={s}>
                                {s.toLowerCase()}
                              </MenuItem>
                            ))}
                          </TextField>
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={selected === inc.status || updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: inc.id, status: selected })}
                          >
                            Save
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
