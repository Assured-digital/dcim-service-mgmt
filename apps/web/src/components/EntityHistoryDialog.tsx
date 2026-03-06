import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography
} from "@mui/material";
import { statusChipSx } from "../lib/ui";
import { EmptyState, ErrorState, LoadingState } from "./PageState";

type AuditItem = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string | null;
  actorEmail?: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  title: string;
};

export function EntityHistoryDialog({ open, onClose, entityType, entityId, title }: Props) {
  const query = useQuery({
    queryKey: ["entity-history", entityType, entityId],
    enabled: open,
    queryFn: async () => (await api.get<AuditItem[]>(`/audit-events/entity/${entityType}/${entityId}`)).data
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {query.isLoading ? <LoadingState /> : null}
        {query.error ? <ErrorState title="Failed to load history" /> : null}
        {!query.isLoading && !query.error && (query.data?.length ?? 0) === 0 ? (
          <EmptyState title="No history yet" detail="No audit events were found for this entity." />
        ) : null}
        <List disablePadding>
          {(query.data ?? []).map((event) => {
            const details = event.data ? JSON.stringify(event.data) : null;
            return (
              <ListItem key={event.id} divider alignItems="flex-start">
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" sx={statusChipSx(event.action)} label={event.action.toLowerCase()} />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {event.actorEmail ?? "system"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(event.createdAt).toLocaleString()}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    details ? (
                      <Typography
                        variant="caption"
                        component="pre"
                        sx={{
                          display: "block",
                          mt: 0.8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          bgcolor: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 1,
                          px: 1,
                          py: 0.75
                        }}
                      >
                        {details}
                      </Typography>
                    ) : null
                  }
                />
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
    </Dialog>
  );
}

