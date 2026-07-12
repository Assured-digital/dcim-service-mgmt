import React, { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Alert, Box, Button, Drawer, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material"
import { type ApiError } from "../lib/api"
import { createClient, setClientModules, updateClient, type ClientView } from "../lib/clients"
import { PLATFORM_MODULES } from "../lib/entitlements"

export type ClientFormMode = "create" | "edit"

type Props = {
  open: boolean
  mode: ClientFormMode
  client: ClientView | null
  onClose: () => void
}

const ALL_MODULE_KEYS = PLATFORM_MODULES.map((m) => m.key)

export default function ClientFormDrawer({ open, mode, client, onClose }: Props) {
  const qc = useQueryClient()
  const isEdit = mode === "edit"

  const [name, setName] = useState("")
  const [status, setStatus] = useState("ACTIVE")
  const [lifecycleStage, setLifecycleStage] = useState("ACTIVE")
  const [sharePointFolderPath, setSharePointFolderPath] = useState("")
  const [sharePointSiteId, setSharePointSiteId] = useState("")
  // A2 — the client's licensed module set (edit mode only; new clients default to
  // all-on server-side and can be narrowed after creation).
  const [modules, setModules] = useState<string[]>(ALL_MODULE_KEYS)

  // Reset form whenever the drawer opens or the target client changes.
  useEffect(() => {
    if (!open) return
    if (isEdit && client) {
      setName(client.name)
      setStatus(client.status)
      setLifecycleStage(client.lifecycleStage ?? "ACTIVE")
      setSharePointFolderPath(client.sharePointFolderPath ?? "")
      setSharePointSiteId(client.sharePointSiteId ?? "")
      setModules(client.enabledModules ?? ALL_MODULE_KEYS)
    } else {
      setName("")
      setStatus("ACTIVE")
      setLifecycleStage("ACTIVE")
      setSharePointFolderPath("")
      setSharePointSiteId("")
      setModules(ALL_MODULE_KEYS)
    }
  }, [open, mode, client])

  function toggleModule(key: string) {
    setModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const folder = sharePointFolderPath.trim()
      const siteId = sharePointSiteId.trim()
      if (isEdit && client) {
        await updateClient(client.id, { name: name.trim(), status, lifecycleStage, sharePointFolderPath: folder, sharePointSiteId: siteId })
        // Module access is a separate declarative endpoint.
        await setClientModules(client.id, modules)
        return
      }
      await createClient({ name: name.trim(), status, lifecycleStage, sharePointFolderPath: folder || undefined, sharePointSiteId: siteId || undefined })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clients"] })
      await qc.invalidateQueries({ queryKey: ["clients-mine"] })
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
            ? "Update the client tenant name, status, or module access."
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

          <TextField
            label="SharePoint site ID"
            value={sharePointSiteId}
            onChange={(e) => setSharePointSiteId(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            placeholder="contoso.sharepoint.com,<siteGuid>,<webGuid>"
            helperText="C1 — this client's own SharePoint site (Graph site id). Holds their Documents + Evidence libraries."
          />

          {isEdit ? (
            <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>Module access</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 12, mb: 1 }}>
                Which products this client can see and use. Disabling one hides it from their
                navigation and blocks access.
              </Typography>
              <Stack>
                {PLATFORM_MODULES.map((m) => (
                  <FormControlLabel
                    key={m.key}
                    sx={{ alignItems: "flex-start", mx: 0, mb: 0.5 }}
                    control={
                      <Switch
                        size="small"
                        checked={modules.includes(m.key)}
                        onChange={() => toggleModule(m.key)}
                        sx={{ mt: 0.25 }}
                      />
                    }
                    label={
                      <Box sx={{ ml: 0.5 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{m.label}</Typography>
                        <Typography color="text.secondary" sx={{ fontSize: 11.5 }}>{m.description}</Typography>
                      </Box>
                    }
                  />
                ))}
              </Stack>
            </Box>
          ) : null}

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
