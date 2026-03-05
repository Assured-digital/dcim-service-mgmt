import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import { getCurrentUser, isOrgSuperRole } from "../lib/auth";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";

type Organization = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type SuperUser = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function OrganizationPage() {
  const qc = useQueryClient();
  const currentUser = getCurrentUser();
  const isOwner = currentUser?.role === "ORG_OWNER" || currentUser?.role === "ADMIN";

  const [orgNameDraft, setOrgNameDraft] = useState("");
  const [orgStatusDraft, setOrgStatusDraft] = useState("ACTIVE");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ORG_ADMIN");
  const [isActive, setIsActive] = useState(true);

  const [drafts, setDrafts] = useState<Record<string, { role: string; isActive: boolean }>>({});

  const organization = useQuery({
    queryKey: ["organization-me"],
    queryFn: async () => (await api.get<Organization>("/organizations/me")).data
  });

  const superUsers = useQuery({
    queryKey: ["organization-super-users"],
    enabled: isOrgSuperRole(currentUser?.role),
    queryFn: async () => (await api.get<SuperUser[]>("/organizations/me/super-users")).data
  });

  React.useEffect(() => {
    if (!organization.data) return;
    setOrgNameDraft((prev) => prev || organization.data?.name || "");
    setOrgStatusDraft((prev) => prev || organization.data?.status || "ACTIVE");
  }, [organization.data]);

  const updateOrg = useMutation({
    mutationFn: async () =>
      (
        await api.patch<Organization>("/organizations/me", {
          name: orgNameDraft.trim(),
          status: orgStatusDraft
        })
      ).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["organization-me"] });
    }
  });

  const createSuperUser = useMutation({
    mutationFn: async () =>
      (
        await api.post<SuperUser>("/organizations/me/super-users", {
          email,
          password,
          role,
          isActive
        })
      ).data,
    onSuccess: async () => {
      setEmail("");
      setPassword("");
      setRole("ORG_ADMIN");
      setIsActive(true);
      await qc.invalidateQueries({ queryKey: ["organization-super-users"] });
    }
  });

  const updateSuperUser = useMutation({
    mutationFn: async (payload: { id: string; role: string; isActive: boolean }) =>
      (await api.patch<SuperUser>(`/organizations/me/super-users/${payload.id}`, payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["organization-super-users"] });
    }
  });

  const mutationError = [updateOrg.error, createSuperUser.error, updateSuperUser.error].find(Boolean) as
    | ApiError
    | undefined;
  const mutationErrorMessage = Array.isArray(mutationError?.message)
    ? mutationError.message.join(", ")
    : mutationError?.message;

  const orgChanged =
    !!organization.data &&
    (orgNameDraft.trim() !== organization.data.name || orgStatusDraft !== organization.data.status);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Organization
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Manage organization profile and super users who administer all clients.
      </Typography>

      {mutationErrorMessage ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {mutationErrorMessage}
        </Alert>
      ) : null}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.2 }}>
            Profile
          </Typography>
          {organization.isLoading ? <LoadingState /> : null}
          {organization.error ? <ErrorState title="Failed to load organization" /> : null}

          {organization.data ? (
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
              <TextField
                label="Organization Name"
                value={orgNameDraft}
                onChange={(e) => setOrgNameDraft(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                disabled={!isOwner}
              />
              <TextField
                select
                label="Status"
                value={orgStatusDraft}
                onChange={(e) => setOrgStatusDraft(e.target.value)}
                sx={{ minWidth: 200 }}
                disabled={!isOwner}
              >
                <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                <MenuItem value="INACTIVE">INACTIVE</MenuItem>
              </TextField>
              <Button
                variant="contained"
                disabled={!isOwner || !orgChanged || updateOrg.isPending || orgNameDraft.trim().length < 2}
                onClick={() => updateOrg.mutate()}
              >
                Save
              </Button>
            </Stack>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.2 }}>
            Super Users
          </Typography>

          {isOwner ? (
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} sx={{ mb: 2 }}>
              <TextField
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
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
              <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 190 }}>
                <MenuItem value="ORG_ADMIN">ORG_ADMIN</MenuItem>
                <MenuItem value="ORG_OWNER">ORG_OWNER</MenuItem>
              </TextField>
              <FormControlLabel
                control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                label="Active"
                sx={{ whiteSpace: "nowrap", pr: 1 }}
              />
              <Button
                variant="contained"
                disabled={!email.trim() || password.trim().length < 8 || createSuperUser.isPending}
                onClick={() => createSuperUser.mutate()}
              >
                Add
              </Button>
            </Stack>
          ) : null}

          {superUsers.isLoading ? <LoadingState /> : null}
          {superUsers.error ? <ErrorState title="Failed to load super users" /> : null}
          {!superUsers.isLoading && !superUsers.error && (superUsers.data?.length ?? 0) === 0 ? (
            <EmptyState title="No super users" detail="Create organization-level admins to manage all clients." />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(superUsers.data ?? []).map((user) => {
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
                          disabled={!isOwner}
                          sx={{ minWidth: 170 }}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [user.id]: { ...row, role: e.target.value }
                            }))
                          }
                        >
                          <MenuItem value="ORG_OWNER">ORG_OWNER</MenuItem>
                          <MenuItem value="ORG_ADMIN">ORG_ADMIN</MenuItem>
                          <MenuItem value="ADMIN">ADMIN (legacy)</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={row.isActive}
                              disabled={!isOwner}
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
                      <TableCell>{new Date(user.updatedAt).toLocaleDateString()}</TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={!isOwner || !changed || updateSuperUser.isPending}
                          onClick={() => updateSuperUser.mutate({ id: user.id, role: row.role, isActive: row.isActive })}
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
