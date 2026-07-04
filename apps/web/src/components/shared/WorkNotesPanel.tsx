import React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Box, Button, Stack, TextField, Typography } from "@mui/material"
import { api } from "../../lib/api"
import { useNotification } from "../NotificationProvider"
import { getApiErrorMessage } from "../../lib/infrastructure"

// Timestamped work notes on a DCIM estate entity (asset / cabinet / site) — the
// Hyperview "Work Notes" pattern. One shared panel, mounted by the detail pages;
// the server scopes reads/writes and enforces delete ownership.
export type WorkNoteEntityType = "asset" | "cabinet" | "site"

type WorkNote = {
  id: string
  body: string
  createdAt: string
  author: { id: string; displayName: string | null } | null
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    + " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export function WorkNotesPanel({ entityType, entityId, readOnly = false }: {
  entityType: WorkNoteEntityType
  entityId: string
  readOnly?: boolean
}) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [body, setBody] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const queryKey = ["work-notes", entityType, entityId]
  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await api.get<WorkNote[]>("/work-notes", { params: { entityType, entityId } })).data,
    enabled: !!entityId,
  })

  async function add() {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    try {
      await api.post("/work-notes", { entityType, entityId, body: text })
      setBody("")
      qc.invalidateQueries({ queryKey })
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to add note")) }
    finally { setSaving(false) }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/work-notes/${id}`)
      qc.invalidateQueries({ queryKey })
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to delete note")) }
  }

  return (
    <Box>
      {!readOnly ? (
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: notes.length ? "12px" : 0 }}>
          <TextField
            size="small" fullWidth multiline maxRows={4}
            placeholder="Add a work note…"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add() } }}
            InputProps={{ sx: { fontSize: 12.5 } }}
          />
          <Button size="small" variant="contained" disableElevation onClick={add} disabled={saving || !body.trim()}
            sx={{ textTransform: "none", fontSize: 12, flexShrink: 0, boxShadow: "none", bgcolor: "rgba(29,78,216,0.12)", color: "primary.main", border: "1px solid rgba(29,78,216,0.35)", "&:hover": { bgcolor: "rgba(29,78,216,0.2)" } }}>
            Add
          </Button>
        </Stack>
      ) : null}

      {isLoading ? null : notes.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: "text.secondary", py: readOnly ? "4px" : 0 }}>
          No work notes yet{readOnly ? "." : " — capture install details, quirks, hand-over context."}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {notes.map(n => (
            <Box key={n.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: "9px 12px" }}>
              <Stack direction="row" alignItems="baseline" spacing={1}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>
                  {n.author?.displayName ?? "Unknown"}
                </Typography>
                <Typography sx={{ fontSize: 10.5, color: "text.tertiary", flex: 1 }}>{formatWhen(n.createdAt)}</Typography>
                {!readOnly ? (
                  <Button size="small" onClick={() => remove(n.id)}
                    sx={{ textTransform: "none", fontSize: 10.5, minWidth: 0, px: "4px", py: 0, color: "text.tertiary", "&:hover": { color: "error.main", bgcolor: "transparent" } }}>
                    Delete
                  </Button>
                ) : null}
              </Stack>
              <Typography sx={{ fontSize: 12.5, mt: "3px", whiteSpace: "pre-wrap" }}>{n.body}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}
