import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { EmptyState, ErrorState, LoadingState } from "./PageState";
import { type AuditEvent } from "../lib/auditEvents";
import { AuditHistoryList } from "./AuditHistoryList";

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
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/${entityType}/${entityId}`)).data
  });

  const events = query.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {query.isLoading ? <LoadingState /> : null}
        {query.error ? <ErrorState title="Failed to load history" /> : null}
        {!query.isLoading && !query.error && events.length === 0 ? (
          <EmptyState title="No history yet" detail="No audit events were found for this entity." />
        ) : null}
        {/* Shared, humanised, content-free renderer — recordNoun derives from each event's entityType. */}
        {events.length > 0 ? <AuditHistoryList events={events} /> : null}
      </DialogContent>
    </Dialog>
  );
}
