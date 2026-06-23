import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from "@mui/material"
import { useThemeMode } from "../../lib/theme"

// Reviewer flag-for-rework note. Flagging an item on the PENDING_REVIEW review surface always
// captures a short note (required — the engineer needs to know why) before the flag is written.
// Mirrors the Return-requires-note rule: the confirm stays disabled until the note has content.
// Works on any response (a passed item can be flagged for re-check), so the copy is response-neutral.
export function FlagNoteDialog({
  open,
  itemLabel,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  itemLabel: string
  saving?: boolean
  onClose: () => void
  // eslint-disable-next-line no-unused-vars
  onSave: (note: string) => void
}) {
  const { mode } = useThemeMode()
  const [note, setNote] = React.useState("")

  // Reset to an empty note each time the dialog opens for a (possibly different) item.
  React.useEffect(() => {
    if (open) setNote("")
  }, [open])

  const canSave = note.trim().length > 0

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Flag for rework</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: mode === "dark" ? "#3a2c0f" : "#fffbeb", border: `1px solid ${mode === "dark" ? "#5b4420" : "#fde68a"}` }}>
            <Typography variant="caption" sx={{ color: mode === "dark" ? "#fbbf24" : "#92400e", lineHeight: 1.5 }}>
              {itemLabel}
            </Typography>
          </Box>
          <TextField
            label="Note for the engineer (required)"
            multiline
            rows={3}
            fullWidth
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Explain what needs re-checking or correcting…"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          disabled={!canSave || saving}
          onClick={() => onSave(note.trim())}
        >
          {saving ? "Flagging…" : "Flag item"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
