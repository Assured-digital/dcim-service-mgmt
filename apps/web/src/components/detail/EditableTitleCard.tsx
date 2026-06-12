import React from "react"
import { Box, Button, InputBase, Stack } from "@mui/material"
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
  // Dirty only when editing AND non-empty AND changed — an empty draft is
  // non-savable and counts as clean (preserves today's "empty reverts"
  // behaviour: no field can be cleared via this editor). Save/Cancel mount only
  // while dirty, so merely focusing the field never pushes surrounding content.
  const dirty = editing && trimmed !== "" && trimmed !== value

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
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  // One always-present auto-sizing field (a textarea). Idle = `readOnly` with a
  // transparent border so it reads as plain text; focus/edit flips the border to
  // the accent token. Because the SAME element renders in both states (same
  // padding, same border width, content-autosized height), the footprint is
  // identical idle↔editing — no enlarge, no layout shift on focus (VS Code style).
  const isEmpty = !editing && !value
  return (
    <Box onBlur={handleBlur}>
      <InputBase
        fullWidth
        multiline
        minRows={multiline ? 3 : 1}
        value={editing ? draft : value}
        readOnly={!editing}
        placeholder={placeholder}
        inputProps={{ "aria-label": ariaLabel }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          if (!editing) startEditing()
          // Single-line (Subject): select-all on entry, as before.
          if (!multiline) (e.target as HTMLTextAreaElement).select()
        }}
        sx={{
          // Match the squarer SectionPanel corner (global radius token).
          borderRadius: 1,
          px: 0.75,
          py: 0.5,
          // 1px border, transparent when idle → accent token on focus/edit. Same
          // width in both states, so the box never grows on focus.
          border: "1px solid",
          borderColor: editing ? "primary.main" : "transparent",
          color: isEmpty ? "text.disabled" : "text.primary",
          cursor: editing ? "text" : "pointer",
          transition: "border-color 120ms ease, background-color 120ms ease",
          "&:hover": { bgcolor: editing ? "transparent" : "action.hover" },
          ...textSx,
          "& .MuiInputBase-input": { p: 0, cursor: "inherit" },
        }}
      />
      {dirty && (
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="contained"
            disableElevation
            onClick={save}
          >
            Save
          </Button>
          <Button size="small" color="inherit" onClick={cancel}>
            Cancel
          </Button>
        </Stack>
      )}
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
      <SectionPanel>
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
