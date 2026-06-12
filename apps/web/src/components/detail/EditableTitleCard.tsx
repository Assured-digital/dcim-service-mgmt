import React from "react"
import { Box, Button, Stack, TextField } from "@mui/material"
import { SectionPanel } from "./RecordDetailShell"

// ─────────────────────────────────────────────────────────────────────────────
// EditableField — explicit click-to-edit with dirty-tracked Save/Cancel.
//
// Unlike the per-page `InlineEditable` (contentEditable, commit-on-blur), this
// editor follows the Jira model: a *dirty* edit must be explicitly Saved or
// Cancelled — clicking out does NOT auto-commit. A *clean* edit (no change) is
// free to exit on click-out / Cancel / Escape. Used only for Subject and
// Description; the other inline fields (assessment/impl/notes) keep their own
// commit-on-blur InlineEditable.
// ─────────────────────────────────────────────────────────────────────────────

interface EditableFieldProps {
  value: string
  onSave: (next: string) => void
  multiline?: boolean
  placeholder?: string
  ariaLabel: string
  // Styling applied to the read-mode text and the editor input, so edit mode
  // reads consistently with the rest of the page.
  textSx?: object
}

export const EditableField = React.memo(function EditableField({
  value,
  onSave,
  multiline = false,
  placeholder,
  ariaLabel,
  textSx,
}: EditableFieldProps) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)

  const trimmed = draft.trim()
  // Dirty only when non-empty AND changed — an empty draft is non-savable and
  // counts as clean (preserves today's "empty reverts" behaviour: no field can
  // be cleared via this editor).
  const dirty = trimmed !== "" && trimmed !== value

  const startEditing = React.useCallback(() => {
    setDraft(value)
    setEditing(true)
  }, [value])

  const save = React.useCallback(() => {
    if (trimmed !== "" && trimmed !== value) onSave(trimmed)
    setEditing(false)
  }, [trimmed, value, onSave])

  const cancel = React.useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  // Focus left the editor entirely. If clean, exit edit mode; if dirty, stay
  // (force an explicit Save/Cancel). Focus moving to the Save/Cancel buttons is
  // still inside the wrapper, so it does not count as "clicking out".
  const handleBlur = React.useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null
      if (next && e.currentTarget.contains(next)) return
      if (!dirty) setEditing(false)
    },
    [dirty]
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault()
        cancel()
        return
      }
      // Single-line: Enter saves (explicit keypress). Multiline: Enter = newline.
      if (!multiline && e.key === "Enter") {
        e.preventDefault()
        save()
      }
    },
    [multiline, cancel, save]
  )

  if (!editing) {
    const isEmpty = !value
    return (
      <Box
        role="textbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onClick={startEditing}
        onFocus={startEditing}
        sx={{
          cursor: "pointer",
          borderRadius: 1,
          px: 0.75,
          py: 0.5,
          whiteSpace: multiline ? "pre-wrap" : "normal",
          border: "1.5px solid transparent",
          color: isEmpty ? "text.disabled" : "text.primary",
          "&:hover": { bgcolor: "action.hover" },
          ...textSx,
        }}
      >
        {isEmpty ? placeholder ?? "" : value}
      </Box>
    )
  }

  return (
    <Box onBlur={handleBlur}>
      <TextField
        autoFocus
        fullWidth
        multiline={multiline}
        minRows={multiline ? 3 : undefined}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          if (!multiline) e.currentTarget.select()
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            // Match the squarer SectionPanel corner (global radius token) so the
            // inner edit area doesn't read rounder than its container.
            borderRadius: 1,
            "& fieldset": { borderColor: "primary.main" },
          },
          "& .MuiInputBase-input": { ...textSx, px: 0, mx: 0 },
        }}
      />
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
        <Button
          size="small"
          variant="contained"
          disableElevation
          disabled={!dirty}
          onClick={save}
        >
          Save
        </Button>
        <Button size="small" color="inherit" onClick={cancel}>
          Cancel
        </Button>
      </Stack>
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// EditableTitleCard — shared title card for the shell-based detail pages.
// Subject and Description each in their own Jira-style SectionPanel, edited via
// the explicit-Save/Cancel EditableField. Replaces the per-page *TitleCard
// components. The commit handlers (onCommitTitle/onCommitDescription) are the
// pages' existing PUT path — unchanged.
// ─────────────────────────────────────────────────────────────────────────────

interface EditableTitleCardProps {
  title: string
  description: string
  onCommitTitle: (next: string) => void
  onCommitDescription: (next: string) => void
}

export const EditableTitleCard = React.memo(function EditableTitleCard({
  title,
  description,
  onCommitTitle,
  onCommitDescription,
}: EditableTitleCardProps) {
  return (
    <Box>
      <SectionPanel title="Subject">
        <EditableField
          value={title}
          onSave={onCommitTitle}
          ariaLabel="Subject"
          textSx={{
            fontSize: "1.25rem",
            fontWeight: 500,
            lineHeight: 1.6,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        />
      </SectionPanel>

      <SectionPanel title="Description">
        <EditableField
          value={description}
          onSave={onCommitDescription}
          multiline
          placeholder="Add a description"
          ariaLabel="Description"
          textSx={{
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            color: "text.secondary",
          }}
        />
      </SectionPanel>
    </Box>
  )
})
