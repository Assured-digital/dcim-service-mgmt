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
import { useNavigate } from "react-router-dom";
import { statusChipSx } from "../lib/ui";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";

type Survey = {
  id: string;
  title: string;
  surveyType: string;
  status: string;
  scheduledAt?: string | null;
  items?: any[];
};

export default function SurveysPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const canManage = hasAnyRole([
    ...ORG_SUPER_ROLES,
    ROLES.SERVICE_MANAGER,
    ROLES.SERVICE_DESK_ANALYST
  ]);
  const [title, setTitle] = useState("");
  const [surveyType, setSurveyType] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["surveys"],
    queryFn: async () => (await api.get<Survey[]>("/surveys")).data
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<Survey>("/surveys", {
          title,
          surveyType,
          scheduledAt: scheduledAt || undefined
        })
      ).data,
    onSuccess: async () => {
      setTitle("");
      setSurveyType("");
      setScheduledAt("");
      await qc.invalidateQueries({ queryKey: ["surveys"] });
    }
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/surveys/${id}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["surveys"] });
    }
  });

  const mutationError = (create.error ?? remove.error) as ApiError | undefined;
  const mutationErrorMessage = Array.isArray(mutationError?.message)
    ? mutationError?.message.join(", ")
    : mutationError?.message;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Engineering Checks
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Completed and planned Engineering Checks.
      </Typography>

      {canManage ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} sx={{ minWidth: 260 }} />
              <TextField label="Type" value={surveyType} onChange={(e) => setSurveyType(e.target.value)} sx={{ minWidth: 180 }} />
              <TextField
                label="Scheduled Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                sx={{ minWidth: 190 }}
              />
              <Button
                variant="contained"
                onClick={() => create.mutate()}
                disabled={!title.trim() || !surveyType.trim() || create.isPending}
              >
                Create
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          {mutationErrorMessage ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {mutationErrorMessage}
            </Alert>
          ) : null}
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load surveys" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="No surveys yet" detail="Create or schedule audits to begin survey execution." />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Scheduled</TableCell>
                  <TableCell>Items</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell sx={{ fontWeight: 700 }}>{s.title}</TableCell>
                    <TableCell>{s.surveyType}</TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(s.status)} label={s.status.toLowerCase().replaceAll("_", " ")} />
                    </TableCell>
                    <TableCell>{s.scheduledAt ? new Date(s.scheduledAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>{s.items?.length ?? 0}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.8} justifyContent="flex-end">
                        <Button size="small" variant="outlined" onClick={() => nav(`/surveys/${s.id}`)}>
                          Open
                        </Button>
                        {canManage ? (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={remove.isPending}
                            onClick={() => setDeleteTarget(s)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>Delete Survey</DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            This will permanently delete the selected survey and all associated checklist items.
          </Typography>
          <Card variant="outlined" sx={{ bgcolor: "#f8fafc" }}>
            <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
              <Typography variant="subtitle2">{deleteTarget?.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {deleteTarget?.surveyType}
              </Typography>
            </CardContent>
          </Card>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={!deleteTarget || remove.isPending}
            onClick={async () => {
              if (!deleteTarget) return;
              await remove.mutateAsync(deleteTarget.id);
              setDeleteTarget(null);
            }}
          >
            {remove.isPending ? "Deleting..." : "Delete Survey"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
