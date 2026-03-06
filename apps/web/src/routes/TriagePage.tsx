import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../lib/api";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  TextField,
  Typography
} from "@mui/material";
import { statusChipSx } from "../lib/ui";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";

type TriageItem = {
  id: string;
  sourceType: "REQUEST_INTAKE" | "PUBLIC_SUBMISSION";
  requesterName: string;
  requesterEmail: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  convertedEntityType?: string | null;
  convertedEntityId?: string | null;
};

export default function TriagePage() {
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST]);
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<TriageItem | null>(null);
  const [targetType, setTargetType] = React.useState<"SERVICE_REQUEST" | "INCIDENT" | "TASK">("SERVICE_REQUEST");
  const [priority, setPriority] = React.useState("medium");
  const [incidentSeverity, setIncidentSeverity] = React.useState("MEDIUM");
  const [taskDueAt, setTaskDueAt] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: async () => (await api.get<TriageItem[]>("/triage/queue")).data
  });

  const convert = useMutation({
    mutationFn: async (row: TriageItem) =>
      (
        await api.post(`/triage/${row.sourceType}/${row.id}/convert`, {
          targetType,
          priority,
          incidentSeverity: targetType === "INCIDENT" ? incidentSeverity : undefined,
          taskDueAt: targetType === "TASK" ? taskDueAt : undefined,
          title: title.trim() || undefined,
          description: description.trim() || undefined
        })
      ).data,
    onSuccess: async () => {
      setSelected(null);
      setTitle("");
      setDescription("");
      setTaskDueAt("");
      setTargetType("SERVICE_REQUEST");
      setPriority("medium");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["triage-queue"] }),
        qc.invalidateQueries({ queryKey: ["triage-submissions"] }),
        qc.invalidateQueries({ queryKey: ["request-intakes-mine"] }),
        qc.invalidateQueries({ queryKey: ["service-requests"] }),
        qc.invalidateQueries({ queryKey: ["srs"] }),
        qc.invalidateQueries({ queryKey: ["incidents"] }),
        qc.invalidateQueries({ queryKey: ["tasks"] })
      ]);
    }
  });

  const convertError = convert.error as ApiError | null;
  const convertErrorMessage = Array.isArray(convertError?.message)
    ? convertError?.message.join(", ")
    : convertError?.message;

  const openConvert = (row: TriageItem) => {
    setSelected(row);
    setTargetType("SERVICE_REQUEST");
    setPriority("medium");
    setIncidentSeverity("MEDIUM");
    setTaskDueAt("");
    setTitle(row.title);
    setDescription(row.description);
  };

  const convertDisabled =
    !selected ||
    !priority.trim() ||
    (targetType === "INCIDENT" && !incidentSeverity) ||
    (targetType === "TASK" && !taskDueAt);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Triage
      </Typography>
      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load triage inbox" /> : null}
          {convertError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {convertErrorMessage ?? "Failed to convert submission"}
            </Alert>
          ) : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="Triage inbox is clear" detail="No pending requests at the moment." />
          ) : null}

          <TableContainer>
          <Table sx={{ minWidth: 880 }}>
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell>Requester</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data ?? []).map((row) => {
                const canConvert = row.status === "NEW";
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={row.sourceType === "REQUEST_INTAKE" ? "internal" : "public"}
                      />
                    </TableCell>
                    <TableCell>{row.requesterName}</TableCell>
                    <TableCell>{row.requesterEmail}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(row.status)} label={row.status.toLowerCase()} />
                    </TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!canManage || !canConvert || convert.isPending}
                        onClick={() => openConvert(row)}
                      >
                        {canConvert ? "Convert" : "Converted"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>Convert Triage Item</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField select label="Convert To" value={targetType} onChange={(e) => setTargetType(e.target.value as any)}>
              <MenuItem value="SERVICE_REQUEST">Service Request</MenuItem>
              <MenuItem value="INCIDENT">Incident</MenuItem>
              <MenuItem value="TASK">Task</MenuItem>
            </TextField>
            <TextField select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>
            {targetType === "INCIDENT" ? (
              <TextField
                select
                label="Incident Severity (required)"
                value={incidentSeverity}
                onChange={(e) => setIncidentSeverity(e.target.value)}
              >
                <MenuItem value="LOW">LOW</MenuItem>
                <MenuItem value="MEDIUM">MEDIUM</MenuItem>
                <MenuItem value="HIGH">HIGH</MenuItem>
                <MenuItem value="CRITICAL">CRITICAL</MenuItem>
              </TextField>
            ) : null}
            {targetType === "TASK" ? (
              <TextField
                label="Task Due Date (required)"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={taskDueAt}
                onChange={(e) => setTaskDueAt(e.target.value)}
              />
            ) : null}
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={convertDisabled || convert.isPending}
            onClick={() => selected && convert.mutate(selected)}
          >
            Convert
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
