import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
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
import { getCurrentUser } from "../lib/auth";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { hasAnyRole, ROLES } from "../lib/rbac";

type UserRecord = {
  id: string;
  email: string;
  role: string;
  clientId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Client = {
  id: string;
  name: string;
};

type UserDraft = {
  role: string;
  isActive: boolean;
};

const adminRoles = [
  ROLES.ADMIN,
  ROLES.SERVICE_MANAGER,
  ROLES.SERVICE_DESK_ANALYST,
  ROLES.ENGINEER,
  ROLES.CLIENT_VIEWER
];

const managerRoles = [ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER];

export default function UsersPage() {
  const qc = useQueryClient();
  const currentUser = getCurrentUser();
  const isAdmin = hasAnyRole([ROLES.ADMIN]);
  const allowedRoles = isAdmin ? adminRoles : managerRoles;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(allowedRoles[0]);
  const [clientId, setClientId] = useState(currentUser?.clientId ?? "");
  const [isActive, setIsActive] = useState(true);
  const [scopeClientId, setScopeClientId] = useState(currentUser?.clientId ?? "");
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [createNotice, setCreateNotice] = useState<{ tone: "success" | "info"; message: string } | null>(null);

  const users = useQuery({
    queryKey: ["users", scopeClientId],
    queryFn: async () => {
      const headers = { "x-client-id": scopeClientId || "" };
      return (await api.get<UserRecord[]>("/users", { headers })).data;
    }
  });

  const clients = useQuery({
    queryKey: ["clients"],
    enabled: isAdmin,
    queryFn: async () => (await api.get<Client[]>("/clients")).data
  });

  const clientOptions = useMemo(() => clients.data ?? [], [clients.data]);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<UserRecord>("/users", {
          email,
          password,
          role,
          clientId: clientId || undefined,
          isActive
        })
      ).data,
    onSuccess: async (created) => {
      setEmail("");
      setPassword("");
      setRole(allowedRoles[0]);
      setIsActive(true);
      if (scopeClientId && created.clientId !== scopeClientId) {
        const scopedClientName = clientOptions.find((c) => c.id === scopeClientId)?.name ?? scopeClientId;
        const createdClientName = created.clientId
          ? (clientOptions.find((c) => c.id === created.clientId)?.name ?? created.clientId)
          : "No client";
        setCreateNotice({
          tone: "info",
          message: `User created under ${createdClientName}. Current view scope is ${scopedClientName}, so it is hidden from this table.`
        });
      } else {
        setCreateNotice({
          tone: "success",
          message: `User created: ${created.email}`
        });
      }
      await qc.invalidateQueries({ queryKey: ["users"] });
    }
  });

  const update = useMutation({
    mutationFn: async (payload: { id: string; role: string; isActive: boolean }) =>
      (await api.patch<UserRecord>(`/users/${payload.id}`, { role: payload.role, isActive: payload.isActive })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
    }
  });

  const mutationError = [create.error, update.error].find(Boolean) as ApiError | undefined;
  const mutationErrorMessage = Array.isArray(mutationError?.message)
    ? mutationError.message.join(", ")
    : mutationError?.message;
  const clientLabelById = new Map((clientOptions ?? []).map((c) => [c.id, c.name]));

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Users
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Manage user access, role assignments, and account activation per tenant scope.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              autoComplete="off"
              inputProps={{ autoComplete: "off" }}
            />
            <TextField
              label="Temporary Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              autoComplete="new-password"
            />
            <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 220 }}>
              {allowedRoles.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
            {isAdmin ? (
              <TextField
                select
                label="Client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="">No client</MenuItem>
                {clientOptions.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label="Active"
              sx={{ whiteSpace: "nowrap", pr: 1 }}
            />
            <Button
              variant="contained"
              onClick={() => create.mutate()}
              disabled={!email.trim() || password.trim().length < 8 || create.isPending}
            >
              Create
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} sx={{ mb: 2 }}>
            {isAdmin ? (
              <TextField
                select
                label="View scope"
                value={scopeClientId}
                onChange={(e) => {
                  setScopeClientId(e.target.value);
                  setCreateNotice(null);
                }}
                sx={{ minWidth: 260 }}
              >
                <MenuItem value="">All clients</MenuItem>
                {clientOptions.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Chip label="Scoped to your client" color="default" variant="outlined" />
            )}
          </Stack>

          {users.isLoading ? <LoadingState /> : null}
          {users.error ? <ErrorState title="Failed to load users" /> : null}
          {createNotice ? (
            <Alert severity={createNotice.tone} sx={{ mb: 2 }} onClose={() => setCreateNotice(null)}>
              {createNotice.message}
            </Alert>
          ) : null}
          {mutationErrorMessage ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {mutationErrorMessage}
            </Alert>
          ) : null}
          {!users.isLoading && !users.error && (users.data?.length ?? 0) === 0 ? (
            <EmptyState title="No users found" detail="Create users to grant operational access for this client scope." />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Client</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(users.data ?? []).map((user) => {
                  const row = drafts[user.id] ?? { role: user.role, isActive: user.isActive };
                  const changed = row.role !== user.role || row.isActive !== user.isActive;
                  return (
                    <TableRow key={user.id}>
                      <TableCell sx={{ fontWeight: 700 }}>{user.email}</TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={row.role}
                          sx={{ minWidth: 210 }}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [user.id]: { ...row, role: e.target.value }
                            }))
                          }
                        >
                          {allowedRoles.map((r) => (
                            <MenuItem key={r} value={r}>
                              {r}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={row.isActive}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [user.id]: { ...row, isActive: e.target.checked }
                                }))
                              }
                            />
                          }
                          label={row.isActive ? "active" : "inactive"}
                        />
                      </TableCell>
                      <TableCell>{(user.clientId && clientLabelById.get(user.clientId)) || user.clientId || "-"}</TableCell>
                      <TableCell>{new Date(user.updatedAt).toLocaleDateString()}</TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={!changed || update.isPending}
                          onClick={() => update.mutate({ id: user.id, role: row.role, isActive: row.isActive })}
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
