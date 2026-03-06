import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Card, CardContent, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { api, type ApiError } from "../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { statusChipSx } from "../lib/ui";

type RequestIntake = {
  id: string;
  title: string;
  description: string;
  category?: string | null;
  impact?: string | null;
  urgency?: string | null;
  status: string;
  createdAt: string;
};

export default function RaiseRequestPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("operational");
  const [impact, setImpact] = useState("medium");
  const [urgency, setUrgency] = useState("medium");

  const mine = useQuery({
    queryKey: ["request-intakes-mine"],
    queryFn: async () => (await api.get<RequestIntake[]>("/request-intakes/mine")).data
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<RequestIntake>("/request-intakes", {
          title,
          description,
          category,
          impact,
          urgency
        })
      ).data,
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setCategory("operational");
      setImpact("medium");
      setUrgency("medium");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["request-intakes-mine"] }),
        qc.invalidateQueries({ queryKey: ["triage-queue"] })
      ]);
    }
  });

  const createError = create.error as ApiError | null;
  const createErrorMessage = Array.isArray(createError?.message) ? createError.message.join(", ") : createError?.message;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Raise Request
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Submit an operational request. It will be queued in Triage for conversion to a service request, incident, or task.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
            <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="operational">Operational</MenuItem>
              <MenuItem value="access">Access</MenuItem>
              <MenuItem value="network">Network</MenuItem>
              <MenuItem value="power">Power</MenuItem>
              <MenuItem value="cooling">Cooling</MenuItem>
            </TextField>
            <TextField select label="Impact" value={impact} onChange={(e) => setImpact(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>
            <TextField select label="Urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>
          </Stack>
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            sx={{ mt: 1.2 }}
          />
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.2 }}>
            <Button
              variant="contained"
              onClick={() => create.mutate()}
              disabled={!title.trim() || description.trim().length < 10 || create.isPending}
            >
              Submit
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {createErrorMessage ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createErrorMessage}
            </Alert>
          ) : null}
          {mine.isLoading ? <LoadingState /> : null}
          {mine.error ? <ErrorState title="Failed to load your requests" /> : null}
          {!mine.isLoading && !mine.error && (mine.data?.length ?? 0) === 0 ? (
            <EmptyState title="No requests yet" detail="Submit a request and it will appear here." />
          ) : null}
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Impact/Urgency</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(mine.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ fontWeight: 700 }}>{row.title}</TableCell>
                  <TableCell>{row.category ?? "-"}</TableCell>
                  <TableCell>{`${row.impact ?? "-"} / ${row.urgency ?? "-"}`}</TableCell>
                  <TableCell>
                    <Chip size="small" sx={statusChipSx(row.status)} label={row.status.toLowerCase()} />
                  </TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}
