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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string | null;
  incident?: IncidentOption | null;
  updatedAt: string;
};

const statusOptions = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"];

export default function TasksPage() {
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]);
  const qc = useQueryClient();
  const [draftStatus, setDraftStatus] = useState<Record<string, string>>({});
  const [statusDialog, setStatusDialog] = useState<{ id: string; title: string; status: string } | null>(null);
  const [statusComment, setStatusComment] = useState("");

  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data
  });

  const updateStatus = useMutation({
    mutationFn: async (payload: { id: string; status: string; comment?: string }) =>
      (await api.post(`/tasks/${payload.id}/status`, { status: payload.status, comment: payload.comment })).data,
    onSuccess: async () => {
      setStatusDialog(null);
      setStatusComment("");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const mutationError = [updateStatus.error].find(Boolean) as ApiError | undefined;
  const mutationErrorMessage = Array.isArray(mutationError?.message)
    ? mutationError?.message.join(", ")
    : mutationError?.message;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Tasks
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Actionable work items linked to operations and incident response.
      </Typography>

      <Card>
        <CardContent>
          {tasks.isLoading ? <LoadingState /> : null}
          {tasks.error ? <ErrorState title="Failed to load tasks" /> : null}
          {mutationErrorMessage ? <Alert severity="error" sx={{ mb: 2 }}>{mutationErrorMessage}</Alert> : null}
          {!tasks.isLoading && !tasks.error && (tasks.data?.length ?? 0) === 0 ? (
            <EmptyState title="No tasks yet" detail="Tasks will appear here when triage items are converted." />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Incident</TableCell>
                  <TableCell>Due</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(tasks.data ?? []).map((task) => {
                  const selected = draftStatus[task.id] ?? task.status;
                  return (
                    <TableRow key={task.id}>
                      <TableCell sx={{ fontWeight: 700 }}>{task.title}</TableCell>
                      <TableCell>
                        <Chip size="small" sx={statusChipSx(task.status)} label={task.status.toLowerCase()} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" sx={priorityChipSx(task.priority)} label={task.priority} />
                      </TableCell>
                      <TableCell>{task.incident?.reference ?? "-"}</TableCell>
                      <TableCell>{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>{new Date(task.updatedAt).toLocaleDateString()}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <TextField
                            select
                            size="small"
                            value={selected}
                            disabled={!canManage}
                            sx={{ minWidth: 150 }}
                            onChange={(e) => setDraftStatus((prev) => ({ ...prev, [task.id]: e.target.value }))}
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
                            disabled={!canManage || selected === task.status || updateStatus.isPending}
                            onClick={() =>
                              setStatusDialog({
                                id: task.id,
                                title: task.title,
                                status: selected
                              })
                            }
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

      <Dialog open={!!statusDialog} onClose={() => setStatusDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Update Task Status</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, mt: 0.5 }}>
            {`Task "${statusDialog?.title ?? ""}" will move to ${statusDialog?.status?.toLowerCase() ?? ""}.`}
          </Typography>
          <TextField
            label="Comment (optional)"
            placeholder="Add context for this status change"
            multiline
            minRows={3}
            fullWidth
            value={statusComment}
            onChange={(e) => setStatusComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialog(null)} disabled={updateStatus.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!statusDialog || updateStatus.isPending}
            onClick={() =>
              statusDialog &&
              updateStatus.mutate({
                id: statusDialog.id,
                status: statusDialog.status,
                comment: statusComment.trim() || undefined
              })
            }
          >
            {updateStatus.isPending ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
