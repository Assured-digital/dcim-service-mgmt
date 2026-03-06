import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Box,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Pagination,
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
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { statusChipSx } from "../lib/ui";

type AuditEvent = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string | null;
  actorEmail?: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};

type AuditResponse = {
  items: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
};

type Actor = {
  id: string;
  email: string;
};

export default function AuditTrailPage() {
  const [page, setPage] = useState(1);
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const actors = useQuery({
    queryKey: ["audit-actors"],
    queryFn: async () => (await api.get<Actor[]>("/audit-events/actors")).data
  });

  const audit = useQuery({
    queryKey: ["audit-events", page, actorUserId, action, entityType, query, dateFrom, dateTo],
    queryFn: async () =>
      (
        await api.get<AuditResponse>("/audit-events", {
          params: {
            page,
            pageSize: 25,
            actorUserId: actorUserId || undefined,
            action: action || undefined,
            entityType: entityType || undefined,
            query: query || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined
          }
        })
      ).data
  });

  const actionOptions = useMemo(
    () =>
      Array.from(new Set((audit.data?.items ?? []).map((x) => x.action))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [audit.data?.items]
  );
  const entityOptions = useMemo(
    () =>
      Array.from(new Set((audit.data?.items ?? []).map((x) => x.entityType))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [audit.data?.items]
  );

  const totalPages = Math.max(1, Math.ceil((audit.data?.total ?? 0) / (audit.data?.pageSize ?? 25)));

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Audit Trail
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Readable activity feed with filters by user, action, entity, and date range.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <TextField
              select
              label="User"
              value={actorUserId}
              onChange={(e) => {
                setPage(1);
                setActorUserId(e.target.value);
              }}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">All users</MenuItem>
              {(actors.data ?? []).map((actor) => (
                <MenuItem key={actor.id} value={actor.id}>
                  {actor.email}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Action"
              value={action}
              onChange={(e) => {
                setPage(1);
                setAction(e.target.value);
              }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">All actions</MenuItem>
              {actionOptions.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Entity"
              value={entityType}
              onChange={(e) => {
                setPage(1);
                setEntityType(e.target.value);
              }}
              sx={{ minWidth: 190 }}
            >
              <MenuItem value="">All entities</MenuItem>
              {entityOptions.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Search"
              placeholder="action/entity/id"
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              sx={{ minWidth: 220 }}
            />
            <TextField
              label="From"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={dateFrom}
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
            />
            <TextField
              label="To"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {audit.isLoading ? <LoadingState /> : null}
          {audit.error ? <ErrorState title="Failed to load audit events" /> : null}
          {!audit.isLoading && !audit.error && (audit.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="No activity found" detail="Try broadening filters or date range." />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(audit.data?.items ?? []).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{new Date(event.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{event.actorEmail ?? "system"}</TableCell>
                    <TableCell>{`${event.entityType} / ${event.entityId}`}</TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(event.action)} label={event.action.toLowerCase()} />
                    </TableCell>
                    <TableCell>
                      {event.data ? (
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            bgcolor: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: 1,
                            px: 1,
                            py: 0.75,
                            m: 0
                          }}
                        >
                          {JSON.stringify(event.data)}
                        </Typography>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Pagination page={page} count={totalPages} onChange={(_e, p) => setPage(p)} />
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

