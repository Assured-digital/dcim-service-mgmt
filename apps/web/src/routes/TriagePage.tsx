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
  triageNotes?: string | null;
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
  const [statusTarget, setStatusTarget] = React.useState<"UNDER_REVIEW" | "REJECTED">("UNDER_REVIEW");
  const [statusNotes, setStatusNotes] = React.useState("");
  const [statusRow, setStatusRow] = React.useState<TriageItem | null>(null);

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
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: ["triage-queue"] });
      const previous = qc.getQueryData<TriageItem[]>(["triage-queue"]) ?? [];
      qc.setQueryData<TriageItem[]>(
        ["triage-queue"],
        previous.map((item) =>
          item.id === row.id && item.sourceType === row.sourceType
            ? { ...item, status: "CONVERTED" }
            : item
        )
      );
      return { previous };
    },
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
    },
    onError: (_error, _row, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["triage-queue"], ctx.previous);
      }
    }
  });

  const updateStatus = useMutation({
    mutationFn: async (row: TriageItem) =>
      (
        await api.post(`/triage/${row.sourceType}/${row.id}/status`, {
          status: statusTarget,
          triageNotes: statusNotes.trim() || undefined
        })
      ).data,
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: ["triage-queue"] });
      const previous = qc.getQueryData<TriageItem[]>(["triage-queue"]) ?? [];
      qc.setQueryData<TriageItem[]>(
        ["triage-queue"],
        previous.map((item) =>
          item.id === row.id && item.sourceType === row.sourceType
            ? { ...item, status: statusTarget, triageNotes: statusNotes.trim() || item.triageNotes }
            : item
        )
      );
      return { previous };
    },
    onSuccess: async () => {
      setStatusRow(null);
      setStatusNotes("");
      setStatusTarget("UNDER_REVIEW");
      await qc.invalidateQueries({ queryKey: ["triage-queue"] });
    },
    onError: (_error, _row, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["triage-queue"], ctx.previous);
      }
    }
  });

  const convertError = convert.error as ApiError | null;
  const convertErrorMessage = Array.isArray(convertError?.message)
    ? convertError?.message.join(", ")
    : convertError?.message;
  const statusError = updateStatus.error as ApiError | null;
  const statusErrorMessage = Array.isArray(statusError?.message) ? statusError?.message.join(", ") : statusError?.message;

  const openConvert = (row: TriageItem) => {
    setSelected(row);
    setTargetType("SERVICE_REQUEST");
    setPriority("medium");
    setIncidentSeverity("MEDIUM");
    setTaskDueAt("");
    setTitle(row.title);
    setDescription(row.description);
  };

  const openStatusDialog = (row: TriageItem, status: "UNDER_REVIEW" | "REJECTED") => {
    setStatusRow(row);
    setStatusTarget(status);
    setStatusNotes(row.triageNotes ?? "");
  };

  const convertDisabled =
    !selected ||
    !priority.trim() ||
    (targetType === "INCIDENT" && !incidentSeverity) ||
    (targetType === "TASK" && !taskDueAt);
  const statusDisabled = !statusRow || (statusTarget === "REJECTED" && statusNotes.trim().length < 5);

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
          {statusError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {statusErrorMessage ?? "Failed to update triage status"}
            </Alert>
          ) : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="Triage inbox is clear" detail="No pending requests at the moment." />
          ) : null}

          <TableContainer>
          <Table sx={{ minWidth: 880 }}>
            <TableHead>
              <TableRow>
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
                const canConvert = row.status === "NEW" || row.status === "UNDER_REVIEW";
                const canSetUnderReview = row.status === "NEW";
                const canReject = row.status === "NEW" || row.status === "UNDER_REVIEW";
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.requesterName}</TableCell>
                    <TableCell>{row.requesterEmail}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(row.status)} label={row.status.toLowerCase()} />
                    </TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.8} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={!canManage || !canSetUnderReview || updateStatus.isPending}
                          onClick={() => openStatusDialog(row, "UNDER_REVIEW")}
                        >
                          Review
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={!canManage || !canReject || updateStatus.isPending}
                          onClick={() => openStatusDialog(row, "REJECTED")}
                        >
                          Reject
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={!canManage || !canConvert || convert.isPending}
                          onClick={() => openConvert(row)}
                        >
                          {canConvert ? "Convert" : "Converted"}
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

      <Dialog open={!!statusRow} onClose={() => setStatusRow(null)} fullWidth maxWidth="sm">
        <DialogTitle>{statusTarget === "UNDER_REVIEW" ? "Mark As Under Review" : "Reject Triage Item"}</DialogTitle>
        <DialogContent>
          <TextField
            label={statusTarget === "REJECTED" ? "Rejection Notes (required)" : "Triage Notes"}
            multiline
            minRows={3}
            fullWidth
            sx={{ mt: 0.5 }}
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusRow(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={statusTarget === "REJECTED" ? "error" : "primary"}
            disabled={statusDisabled || updateStatus.isPending}
            onClick={() => statusRow && updateStatus.mutate(statusRow)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
