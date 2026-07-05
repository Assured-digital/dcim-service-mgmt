import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Alert, Box, Button, Card, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material"
import BoltIcon from "@mui/icons-material/Bolt"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import MailOutlineIcon from "@mui/icons-material/MailOutline"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { api } from "../lib/api"
import { assignTriage, dismissTriage, listTriage, runMailSync, type TriageItem } from "../lib/crm"

type OrgClient = { id: string; name: string }

function TriageRow({ item, clients, onDone }: { item: TriageItem; clients: OrgClient[]; onDone: () => void }) {
  const { notify } = useNotification()
  const [clientId, setClientId] = React.useState("")

  const assign = useMutation({
    mutationFn: () => assignTriage(item.id, { clientId }),
    onSuccess: () => { notify.success("Email filed to client"); onDone() },
    onError: () => notify.error("Couldn't assign"),
  })
  const dismiss = useMutation({
    mutationFn: () => dismissTriage(item.id),
    onSuccess: () => { notify.success("Dismissed"); onDone() },
    onError: () => notify.error("Couldn't dismiss"),
  })

  return (
    <Box sx={{ border: "0.5px solid var(--color-border-primary, #e2e8f0)", borderRadius: 1, p: 1.75 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
        <MailOutlineIcon sx={{ fontSize: 18, color: "var(--color-text-muted)", mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{item.subject}</Typography>
            <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {new Date(item.receivedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            from {item.fromName ? `${item.fromName} · ` : ""}{item.fromAddress}
          </Typography>
          {item.bodyPreview ? (
            <Typography sx={{ fontSize: 12.5, mt: 0.5, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {item.bodyPreview}
            </Typography>
          ) : null}
        </Box>
        {item.webLink ? (
          <Tooltip title="Open in Outlook">
            <IconButton size="small" component="a" href={item.webLink} target="_blank" rel="noopener noreferrer">
              <OpenInNewIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        ) : null}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1.25, alignItems: "center" }}>
        <TextField select size="small" label="Assign to client" value={clientId} onChange={e => setClientId(e.target.value)}
          sx={{ minWidth: 220 }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">— Choose client —</MenuItem>
          {clients.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <Button size="small" variant="contained" disabled={!clientId || assign.isPending} onClick={() => assign.mutate()}>
          {assign.isPending ? "Filing…" : "File as activity"}
        </Button>
        <Button size="small" variant="text" color="inherit" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          Dismiss
        </Button>
      </Stack>
    </Box>
  )
}

export default function CrmTriagePage() {
  const qc = useQueryClient()
  const { notify } = useNotification()

  const triage = useQuery({ queryKey: ["crm-triage"], queryFn: listTriage })
  const clients = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get<OrgClient[]>("/clients")).data })

  const sync = useMutation({
    mutationFn: runMailSync,
    onSuccess: r => {
      if (r.status === "disabled") notify.error("Mail sync is not configured (GRAPH_ENABLED + CRM_MAILBOX_ADDRESS)")
      else notify.success(`Sync done — ${r.filed} filed, ${r.triaged} to triage, ${r.skipped} skipped`)
      qc.invalidateQueries({ queryKey: ["crm-triage"] })
    },
    onError: () => notify.error("Sync failed"),
  })

  const onDone = () => qc.invalidateQueries({ queryKey: ["crm-triage"] })

  return (
    <Box sx={{ maxWidth: 900, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Email triage</Typography>
          <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            Shared-mailbox emails the sync couldn't place — assign each to a client or dismiss.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<BoltIcon sx={{ fontSize: 16 }} />}
          disabled={sync.isPending} onClick={() => sync.mutate()}>
          {sync.isPending ? "Syncing…" : "Run mail sync"}
        </Button>
      </Box>

      {triage.isError ? (
        <ErrorState title="Failed to load triage" />
      ) : triage.isLoading ? (
        <LoadingState label="Loading triage…" />
      ) : (triage.data ?? []).length === 0 ? (
        <>
          <EmptyState title="Nothing to triage" detail="Emails that match a client, quote or opportunity are filed automatically; anything unmatched lands here." />
          <Alert severity="info" sx={{ mt: 2, fontSize: 12.5 }}>
            App-only Mail.Read on the shared mailbox (CRM_MAILBOX_ADDRESS). Wire the mail-sync endpoint to a schedule to run it automatically.
          </Alert>
        </>
      ) : (
        <Stack spacing={1.25}>
          {(triage.data ?? []).map(item => (
            <TriageRow key={item.id} item={item} clients={clients.data ?? []} onDone={onDone} />
          ))}
        </Stack>
      )}
    </Box>
  )
}
