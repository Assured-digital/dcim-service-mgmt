import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { api, type ApiError } from "../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";

type Client = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function ClientsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [drafts, setDrafts] = useState<Record<string, { name: string; status: string }>>({});

  const clients = useQuery({
    queryKey: ["clients-admin"],
    queryFn: async () => (await api.get<Client[]>("/clients")).data
  });

  const create = useMutation({
    mutationFn: async () => (await api.post<Client>("/clients", { name, status })).data,
    onSuccess: async () => {
      setName("");
      setStatus("ACTIVE");
      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["clients-admin"] });
    }
  });

  const update = useMutation({
    mutationFn: async (payload: { id: string; name: string; status: string }) =>
      (await api.patch<Client>(`/clients/${payload.id}`, { name: payload.name, status: payload.status })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["clients-admin"] });
    }
  });

  const mutationError = [create.error, update.error].find(Boolean) as ApiError | undefined;
  const mutationErrorMessage = Array.isArray(mutationError?.message)
    ? mutationError.message.join(", ")
    : mutationError?.message;

  return (
    <Box>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <TextField
              label="Client Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="ACTIVE">ACTIVE</MenuItem>
              <MenuItem value="INACTIVE">INACTIVE</MenuItem>
            </TextField>
            <Button variant="contained" onClick={() => create.mutate()} disabled={name.trim().length < 2 || create.isPending}>
              Create Client
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {clients.isLoading ? <LoadingState /> : null}
          {clients.error ? <ErrorState title="Failed to load clients" /> : null}
          {mutationErrorMessage ? <Alert severity="error" sx={{ mb: 2 }}>{mutationErrorMessage}</Alert> : null}
          {!clients.isLoading && !clients.error && (clients.data?.length ?? 0) === 0 ? (
            <EmptyState title="No clients yet" detail="Create your first client tenant to start onboarding users and data." />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(clients.data ?? []).map((client) => {
                  const row = drafts[client.id] ?? { name: client.name, status: client.status };
                  const changed = row.name !== client.name || row.status !== client.status;
                  return (
                    <TableRow key={client.id}>
                      <TableCell sx={{ minWidth: 260 }}>
                        <TextField
                          size="small"
                          value={row.name}
                          fullWidth
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [client.id]: { ...row, name: e.target.value }
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={row.status}
                          sx={{ minWidth: 170 }}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [client.id]: { ...row, status: e.target.value }
                            }))
                          }
                        >
                          <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                          <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={new Date(client.updatedAt).toLocaleDateString()} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={!changed || row.name.trim().length < 2 || update.isPending}
                          onClick={() => update.mutate({ id: client.id, name: row.name.trim(), status: row.status })}
                        >
                          Save
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
    </Box>
  );
}
