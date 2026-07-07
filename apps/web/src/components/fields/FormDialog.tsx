import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  type Breakpoint,
} from "@mui/material"
import { FormGrid } from "./FormGrid"

// ─────────────────────────────────────────────────────────────────────────────
// FormDialog — the shared create/edit modal shell. Owns the whole chrome:
// Dialog + title + a scrolling DialogContent (children laid out in a FormGrid) +
// a consistent Cancel / submit footer. Callers supply ONLY the fields and the
// submit wiring, so every create modal is identical except its fields — no more
// per-modal divergence in footer placement, width, or spacing.
//
// `banner` renders full-width above the fields (e.g. a "Linked to …" note).
// `canSubmit` gates the submit button; `submitting`/`submittingLabel` show the
// in-flight state. Children are the raw fields (use `span="full"` on long ones).
// ─────────────────────────────────────────────────────────────────────────────

export interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  submitLabel: string
  onSubmit: () => void
  submitting?: boolean
  submittingLabel?: string
  canSubmit?: boolean
  maxWidth?: Breakpoint
  banner?: React.ReactNode
  children: React.ReactNode
}

export function FormDialog({
  open,
  onClose,
  title,
  submitLabel,
  onSubmit,
  submitting = false,
  submittingLabel = "Saving…",
  canSubmit = true,
  maxWidth = "sm",
  banner,
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {banner ? <Box sx={{ mb: 2 }}>{banner}</Box> : null}
        <FormGrid sx={{ mt: 0.5 }}>{children}</FormGrid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={submitting || !canSubmit}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
