import React, { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Alert, Box, Button, Drawer, MenuItem, Stack, TextField, Typography } from "@mui/material"
import { type ApiError } from "../lib/api"
import { createClient, updateClient, type ClientView } from "../lib/clients"

export type ClientFormMode = "create" | "edit"

type Props = {
  open: boolean
  mode: ClientFormMode
  client: ClientView | null
  onClose: () => void
}

export default function ClientFormDrawer({ open, mode, client, onClose }: Props) {
  const qc = useQueryClient()
  const isEdit = mode === "edit"

  const [name, setName] = useState("")
  const [status, setStatus] = useState("ACTIVE")
  const [lifecycleStage, setLifecycleStage] = useState("ACTIVE")
  const [sharePointFolderPath, setSharePointFolderPath] = useState("")

  // Reset form whenever the drawer opens or the target client changes.
  useEffect(() => {
    if (!open) return
    if (isEdit && client) {
      setName(client.name)
      setStatus(client.status)
      setLifecycleStage(client.lifecycleStage ?? "ACTIVE")
      setSharePointFolderPath(client.sharePointFolderPath ?? "")
    } else {
      setName("")
      setStatus("ACTIVE")
      setLifecycleStage("ACTIVE")
      setSharePointFolderPath("")
    }
  }, [open, mode, client])

  const mutation = useMutation({
    mutationFn: async () => {
      const folder = sharePointFolderPath.trim()
      if (isEdit && client) {
        return updateClient(client.id, { name: name.trim(), status, lifecycleStage, sharePointFolderPath: folder })
      }
      return createClient({ name: name.trim(), status, lifecycleStage, sharePointFolderPath: folder || undefined })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clients"] })
      await qc.invalidateQueries({ queryKey: ["clients-admin"] })
      onClose()
    }
  })

  const mutationError = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(mutationError?.message)
    ? mutationError.message.join(", ")
    : mutationError?.message

  const nameTooShort = name.trim().length < 2
  const canSubmit = !nameTooShort && !mutation.isPending

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 340, sm: 420 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {isEdit ? "Edit client" : "Create client"}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
          {isEdit
            ? "Update the client tenant name or status."
            : "Provision a new client tenant to onboard users and data."}
        </Typography>

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <TextField
            label="Client Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            error={name.trim().length > 0 && nameTooShort}
            helperText={name.trim().length > 0 && nameTooShort ? "Must be at least 2 characters." : undefined}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="ACTIVE">ACTIVE</MenuItem>
            <MenuItem value="INACTIVE">INACTIVE</MenuItem>
          </TextField>

          <TextField
            select
            label="Lifecycle stage"
            value={lifecycleStage}
            onChange={(e) => setLifecycleStage(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText="Prospect → Onboarding → Active → Former. Never auto-downgraded."
          >
            <MenuItem value="PROSPECT">Prospect</MenuItem>
            <MenuItem value="ONBOARDING">Onboarding</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="FORMER">Former</MenuItem>
          </TextField>

          <TextField
            label="SharePoint folder path"
            value={sharePointFolderPath}
            onChange={(e) => setSharePointFolderPath(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            placeholder="Clients/Acme Ltd"
            helperText="Folder within the org SharePoint site — powers CRM → Documents."
          />

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => mutation.mutate()} disabled={!canSubmit} fullWidth>
            {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}
