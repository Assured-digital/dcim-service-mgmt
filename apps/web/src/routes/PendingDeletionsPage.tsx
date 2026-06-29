import React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { api } from "../lib/api"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { useBreadcrumb } from "./Shell"
import { PendingDeletion, getApiErrorMessage } from "../lib/infrastructure"

function formatWhen(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

// Approver queue (ORG-super + SERVICE_MANAGER): asset deletion requests raised by
// ENGINEER / SERVICE_DESK_ANALYST, awaiting approve (hard-delete) or reject (cleared).
export function PendingDeletionsPage() {
  const { setPageFullBleed } = useBreadcrumb()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [rejecting, setRejecting] = React.useState<PendingDeletion | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [setPageFullBleed])

  const { data, isLoading, error } = useQuery({
    queryKey: ["asset-deletion-requests"],
    queryFn: async () => (await api.get<PendingDeletion[]>("/assets/deletion-requests")).data
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ["asset-deletion-requests"] })

  async function approve(row: PendingDeletion) {
    setBusyId(row.id)
    try {
      await api.post(`/assets/${row.id}/deletion-request/approve`)
      notify.success("Asset deleted")
      refresh()
    } catch (e) { notify.error(getApiErrorMessage(e, "Failed to approve deletion")) }
    finally { setBusyId(null) }
  }

  async function reject(row: PendingDeletion, notes: string) {
    setBusyId(row.id)
    try {
      await api.post(`/assets/${row.id}/deletion-request/reject`, { notes: notes || undefined })
      notify.success("Deletion request rejected")
      refresh()
    } catch (e) { notify.error(getApiErrorMessage(e, "Failed to reject deletion")); throw e }
    finally { setBusyId(null) }
  }

  if (isLoading) return <Box sx={{ p: 3 }}><LoadingState /></Box>
  if (error) return <Box sx={{ p: 3 }}><ErrorState title="Failed to load deletion requests" /></Box>

  const rows = data ?? []

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", bgcolor: "#f8fafc" }}>
      <Box sx={{ px: 3, py: 2, borderBottom: "1px solid #e2e8f0", bgcolor: "#fff", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Pending deletions</Typography>
        <Typography sx={{ fontSize: 12, color: "#64748b" }}>Asset deletion requests awaiting your approval.</Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", p: 3 }}>
        {rows.length === 0 ? (
          <EmptyState title="No pending deletions" detail="There are no asset deletion requests to review." />
        ) : (
          <Table size="small" sx={{ bgcolor: "#fff", borderRadius: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>Asset</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Requested by</TableCell>
                <TableCell>Requested</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{row.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{row.assetTag}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {row.site?.name ?? "—"}{row.cabinet?.name ? ` / ${row.cabinet.name}` : ""}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{row.requestedBy?.displayName ?? "—"}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{formatWhen(row.deletionRequestedAt)}</TableCell>
                  <TableCell sx={{ fontSize: 12, maxWidth: 240 }}>{row.deletionReason || "—"}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button size="small" color="error" variant="outlined" disabled={busyId === row.id}
                        onClick={() => setRejecting(row)} sx={{ textTransform: "none", fontSize: 12 }}>Reject</Button>
                      <Button size="small" variant="contained" disabled={busyId === row.id}
                        onClick={() => approve(row)} sx={{ textTransform: "none", fontSize: 12 }}>Approve &amp; delete</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {rejecting && (
        <RejectDialog
          row={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={async (notes) => { await reject(rejecting, notes); setRejecting(null) }}
        />
      )}
    </Box>
  )
}

function RejectDialog({ row, onClose, onConfirm }: {
  row: PendingDeletion
  onClose: () => void
  onConfirm: (notes: string) => Promise<void>
}) {
  const [notes, setNotes] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    setBusy(true)
    try { await onConfirm(notes.trim()) } catch { } finally { setBusy(false) }
  }
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reject deletion request</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mt: 0.5, mb: 2 }}>
          Reject the deletion request for <strong>{row.name}</strong>? The asset will be kept.
        </Typography>
        <TextField label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} fullWidth multiline minRows={2} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" onClick={submit} disabled={busy}>{busy ? "Rejecting..." : "Reject"}</Button>
      </DialogActions>
    </Dialog>
  )
}
