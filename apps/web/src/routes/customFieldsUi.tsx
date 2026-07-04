import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Stack, TextField, Typography
} from "@mui/material"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import { api } from "../lib/api"
import { useNotification } from "../components/NotificationProvider"
import { getApiErrorMessage } from "../lib/infrastructure"
import {
  CUSTOM_FIELD_TYPES, CustomFieldType, FIELD_TYPE_LABEL,
  createCustomField, deleteCustomField, formatCustomValue, listCustomFields,
} from "../lib/customFields"

const FIELDS_KEY = ["asset-custom-fields"]

// ── Manage field definitions (org-super / service-manager) ───────────────────
export function ManageCustomFieldsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { data: fields = [] } = useQuery({ queryKey: FIELDS_KEY, queryFn: listCustomFields })

  const [label, setLabel] = React.useState("")
  const [type, setType] = React.useState<CustomFieldType>("text")
  const [optionsText, setOptionsText] = React.useState("")
  const refresh = () => qc.invalidateQueries({ queryKey: FIELDS_KEY })

  const addMut = useMutation({
    mutationFn: () => createCustomField({
      label, type,
      options: type === "select" ? optionsText.split(",").map(o => o.trim()).filter(Boolean) : undefined,
    }),
    onSuccess: () => { setLabel(""); setOptionsText(""); setType("text"); refresh(); notify.success("Field added") },
    onError: (e: unknown) => notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to add field")),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteCustomField(id),
    onSuccess: () => { refresh(); notify.success("Field removed") },
    onError: (e: unknown) => notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to remove")),
  })

  const canAdd = label.trim().length > 0 && (type !== "select" || optionsText.split(",").some(o => o.trim()))

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Custom asset fields</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
          Define fields that appear on every asset's Additional properties. They apply across this client.
        </Typography>

        {/* Existing */}
        <Stack spacing={0.75} sx={{ mb: 2 }}>
          {fields.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>No custom fields yet.</Typography>
          ) : fields.map(f => (
            <Box key={f.id} sx={{ display: "flex", alignItems: "center", gap: 1, border: "1px solid", borderColor: "divider", borderRadius: "8px", px: "12px", py: "7px" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{f.label}</Typography>
                <Typography sx={{ fontSize: 10.5, color: "text.tertiary" }}>
                  {FIELD_TYPE_LABEL[f.type]}{f.type === "select" ? ` · ${f.options.join(", ")}` : ""} · key {f.key}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => delMut.mutate(f.id)} sx={{ color: "text.tertiary", "&:hover": { color: "error.main" } }}>
                <DeleteOutlineIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Box>
          ))}
        </Stack>

        {/* Add */}
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 2 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.tertiary", mb: 1 }}>Add a field</Typography>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <TextField size="small" label="Label" value={label} onChange={e => setLabel(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" select label="Type" value={type} onChange={e => setType(e.target.value as CustomFieldType)} sx={{ width: 120 }}>
              {CUSTOM_FIELD_TYPES.map(t => <MenuItem key={t} value={t}>{FIELD_TYPE_LABEL[t]}</MenuItem>)}
            </TextField>
          </Stack>
          {type === "select" ? (
            <TextField size="small" fullWidth label="Options (comma-separated)" value={optionsText} onChange={e => setOptionsText(e.target.value)} sx={{ mt: 1.5 }} placeholder="Prod, Staging, Dev" />
          ) : null}
          <Box sx={{ mt: 1.5, textAlign: "right" }}>
            <Button size="small" variant="contained" disabled={!canAdd || addMut.isPending} onClick={() => addMut.mutate()} sx={{ textTransform: "none" }}>Add field</Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} sx={{ textTransform: "none" }}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Additional properties on the asset detail (view + edit values) ───────────
export function CustomPropertiesCard({ assetId, values, canManage }: {
  assetId: string; values: Record<string, unknown> | null | undefined; canManage: boolean
}) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { data: fields = [] } = useQuery({ queryKey: FIELDS_KEY, queryFn: listCustomFields })
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  function beginEdit() {
    const d: Record<string, string> = {}
    for (const f of fields) { const v = values?.[f.key]; d[f.key] = v == null ? "" : String(v) }
    setDraft(d); setEditing(true)
  }
  async function save() {
    setSaving(true)
    try {
      // Empty string clears the value (send null so the backend can drop it).
      const patch: Record<string, unknown> = {}
      for (const f of fields) patch[f.key] = draft[f.key]?.trim() ? draft[f.key] : null
      await api.put(`/assets/${assetId}`, { customValues: patch })
      qc.invalidateQueries({ queryKey: ["asset-detail", assetId] })
      notify.success("Properties saved")
      setEditing(false)
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to save")) }
    finally { setSaving(false) }
  }

  if (fields.length === 0) {
    return (
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        No custom fields defined{canManage ? " — add them from the register's Manage fields." : "."}
      </Typography>
    )
  }

  return (
    <Box>
      {!editing ? (
        <>
          <Stack spacing={0}>
            {fields.map(f => (
              <Box key={f.id} sx={{ display: "flex", alignItems: "baseline", py: "6px", borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontSize: 12, color: "text.secondary", width: 150, flexShrink: 0 }}>{f.label}</Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.primary", fontWeight: 500 }}>{formatCustomValue(f, values?.[f.key])}</Typography>
              </Box>
            ))}
          </Stack>
          {canManage ? (
            <Box sx={{ mt: 1.25, textAlign: "right" }}>
              <Button size="small" onClick={beginEdit} sx={{ textTransform: "none", fontSize: 12 }}>Edit properties</Button>
            </Box>
          ) : null}
        </>
      ) : (
        <>
          <Stack spacing={1.5}>
            {fields.map(f => (
              f.type === "select" ? (
                <TextField key={f.id} size="small" select label={f.label} value={draft[f.key] ?? ""} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}>
                  <MenuItem value="">—</MenuItem>
                  {f.options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </TextField>
              ) : (
                <TextField key={f.id} size="small" label={f.label}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  InputLabelProps={f.type === "date" ? { shrink: true } : undefined}
                  value={draft[f.key] ?? ""} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
              )
            ))}
          </Stack>
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
            <Button size="small" onClick={() => setEditing(false)} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button size="small" variant="contained" onClick={save} disabled={saving} sx={{ textTransform: "none" }}>Save</Button>
          </Stack>
        </>
      )}
    </Box>
  )
}
