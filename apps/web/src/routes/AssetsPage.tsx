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
  TableHead,
  TableRow,
  TableContainer,
  TextField,
  Typography
} from "@mui/material";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";

type Asset = {
  id: string;
  assetTag: string;
  name: string;
  assetType: string;
  ownerType: string;
  location?: string | null;
};

export default function AssetsPage() {
  const qc = useQueryClient();
  const isOrgSuper = hasAnyRole([...ORG_SUPER_ROLES]);
  const canManage = hasAnyRole([
    ...ORG_SUPER_ROLES,
    ROLES.SERVICE_MANAGER,
    ROLES.SERVICE_DESK_ANALYST,
    ROLES.ENGINEER
  ]);
  const [assetTag, setAssetTag] = useState("");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("");
  const [ownerType, setOwnerType] = useState<"CLIENT" | "INTERNAL">("CLIENT");
  const [location, setLocation] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<Asset[]>("/assets")).data
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<Asset>("/assets", {
          assetTag,
          name,
          assetType,
          ownerType,
          location: location.trim() || undefined
        })
      ).data,
    onSuccess: async () => {
      setAssetTag("");
      setName("");
      setAssetType("");
      setOwnerType("CLIENT");
      setLocation("");
      await qc.invalidateQueries({ queryKey: ["assets"] });
    }
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/assets/${id}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["assets"] });
    }
  });

  const mutationError = (create.error ?? remove.error) as ApiError | undefined;
  const mutationErrorMessage = Array.isArray(mutationError?.message)
    ? mutationError?.message.join(", ")
    : mutationError?.message;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Assets
      </Typography>

      {canManage ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
              <TextField label="Asset Tag" value={assetTag} onChange={(e) => setAssetTag(e.target.value)} />
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ minWidth: 240 }} />
              <TextField label="Type" value={assetType} onChange={(e) => setAssetType(e.target.value)} />
              <TextField
                select
                label="Owner"
                value={ownerType}
                onChange={(e) => setOwnerType(e.target.value as "CLIENT" | "INTERNAL")}
                disabled={!isOrgSuper}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="CLIENT">client</MenuItem>
                <MenuItem value="INTERNAL">internal</MenuItem>
              </TextField>
              <TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
              <Button
                variant="contained"
                onClick={() => create.mutate()}
                disabled={!assetTag.trim() || !name.trim() || !assetType.trim() || create.isPending}
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
          {error ? <ErrorState title="Failed to load assets" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="No assets found" detail="Assets will appear once inventory is onboarded." />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Asset Tag</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Location</TableCell>
                  {canManage ? <TableCell align="right">Action</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell sx={{ fontWeight: 700 }}>{a.assetTag}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.assetType}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        sx={{ bgcolor: a.ownerType === "INTERNAL" ? "#e8f1ff" : "#e7f8ee", color: "#1e3a8a", fontWeight: 700 }}
                        label={a.ownerType.toLowerCase()}
                      />
                    </TableCell>
                  <TableCell>{a.location ?? "-"}</TableCell>
                  {canManage ? (
                    <TableCell align="right">
                      <Button
                          size="small"
                        color="error"
                        variant="outlined"
                        disabled={remove.isPending}
                        onClick={() => setDeleteTarget(a)}
                      >
                        Delete
                      </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>Delete Asset</DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            This will permanently delete the selected asset.
          </Typography>
          <Card variant="outlined" sx={{ bgcolor: "#f8fafc" }}>
            <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
              <Typography variant="subtitle2">{deleteTarget?.assetTag}</Typography>
              <Typography variant="body2" color="text.secondary">
                {deleteTarget?.name}
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
            {remove.isPending ? "Deleting..." : "Delete Asset"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
