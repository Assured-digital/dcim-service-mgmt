import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Button,
  Typography,
  Stack
} from "@mui/material";
import { priorityChipSx, statusChipSx } from "../lib/ui";
import { EmptyState, ErrorState, LoadingState } from "../components/PageState";
import { EntityHistoryDialog } from "../components/EntityHistoryDialog";

type SR = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
};

export default function ServiceRequestsPage() {
  const navigate = useNavigate();
  const [historyTarget, setHistoryTarget] = React.useState<{ id: string; reference: string } | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["service-requests"],
    queryFn: async () => (await api.get<SR[]>("/service-requests")).data
  });

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Service Requests
      </Typography>
      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load service requests" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No service requests yet"
              detail="New tickets will appear here when submitted or converted from triage."
            />
          ) : null}

          <TableContainer>
            <Table sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ticket</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((sr) => (
                  <TableRow
                    key={sr.id}
                    hover
                    onClick={() => navigate(`/service-requests/${sr.id}`)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>
                      {sr.reference}
                    </TableCell>
                    <TableCell>{sr.subject}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        sx={statusChipSx(sr.status)}
                        label={sr.status.toLowerCase().replaceAll("_", " ")}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
                    </TableCell>
                    <TableCell>{new Date(sr.updatedAt).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryTarget({ id: sr.id, reference: sr.reference });
                          }}
                        >
                          History
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/service-requests/${sr.id}`);
                          }}
                        >
                          View
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <EntityHistoryDialog
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        entityType="ServiceRequest"
        entityId={historyTarget?.id ?? ""}
        title={`Service Request History${historyTarget ? `: ${historyTarget.reference}` : ""}`}
      />
    </Box>
  );
}