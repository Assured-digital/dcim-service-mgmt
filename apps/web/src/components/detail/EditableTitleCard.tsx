import React from "react"
import { Box, Button, InputBase, Stack } from "@mui/material"
import { SectionPanel } from "./RecordDetailShell"

// ─────────────────────────────────────────────────────────────────────────────
// EditableField — the ONE inline text editor. Click-to-edit over a single
// InputBase (a real textarea — accessible, no contentEditable/DOM juggling),
// with a transparent→accent border and no footprint change idle↔editing.
//
// Two commit models, chosen per field via `commit`:
//  • "explicit" (default) — a *dirty* edit must be Saved or Cancelled; clicking
//    out does NOT auto-commit (used for Subject/Description).
//  • "blur" — a dirty edit commits on click-out; no Save/Cancel buttons mount
//    (used for assessment/implementation/notes; replaces the old per-page
//    contentEditable `InlineEditable`, now deleted).
// In both models a *clean* edit (unchanged) exits quietly and Escape reverts.
//
// `allowEmpty` lets a field be cleared to "" (persists the empty value); by
// default an empty draft is treated as clean and reverts (no field cleared).
// ─────────────────────────────────────────────────────────────────────────────

interface EditableFieldProps {
  value: string
  // Returns a promise so we can await persistence: resolve → quiet display,
  // reject → keep the field editable with the draft intact (mirrors the comment
  // box, which keeps its draft when onPost throws). The owning page raises the
  // error toast and rethrows on failure.
  onSave: (next: string) => void | Promise<void>
  multiline?: boolean
  placeholder?: string
  ariaLabel: string
  // Styling applied to the read-mode text and the editor input, so edit mode
  // reads consistently with the rest of the page.
  textSx?: object
  // Commit model — see header. Defaults to explicit Save/Cancel.
  commit?: "explicit" | "blur"
  // When true, an empty draft is a valid (persisted) value; otherwise it reverts.
  allowEmpty?: boolean
}

export const EditableField = React.memo(function EditableField({
  value,
  onSave,
  multiline = false,
  placeholder,
  ariaLabel,
  textSx,
  commit = "explicit",
  allowEmpty = false,
}: EditableFieldProps) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)

  const trimmed = draft.trim()
  // Dirty = editing AND changed AND savable. An empty draft is savable only when
  // allowEmpty (a clear); otherwise it counts as clean and reverts (no field can
  // be cleared). Save/Cancel mount only while dirty (explicit mode), so merely
  // focusing the field never pushes surrounding content.
  const dirty = editing && trimmed !== value && (allowEmpty || trimmed !== "")

  const startEditing = React.useCallback(() => {
    setDraft(value)
    setEditing(true)
  }, [value])

  const save = React.useCallback(async () => {
    // Clean (unchanged, or empty when not allowed) → just exit, nothing to persist.
    if (trimmed === value || (trimmed === "" && !allowEmpty)) {
      setEditing(false)
      return
    }
    try {
      await onSave(trimmed)
      setEditing(false) // success → resolve to quiet display
    } catch {
      // Save failed: the owning page surfaced an error toast; keep the field in
      // edit mode with the draft intact so the user can retry without retyping.
    }
  }, [trimmed, value, onSave, allowEmpty])

  const cancel = React.useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  // Focus left the editor entirely. In blur mode, commit (save() is a no-op for
  // a clean edit). In explicit mode, exit only if clean; a dirty edit stays put,
  // forcing an explicit Save/Cancel. Focus moving to the Save/Cancel buttons is
  // still inside the wrapper, so it does not count as "clicking out".
  const handleBlur = React.useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null
      if (next && e.currentTarget.contains(next)) return
      if (commit === "blur") save()
      else if (!dirty) setEditing(false)
    },
    [commit, dirty, save]
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
          // width in both states, so the box never grows on focus. Highlight via
          // the shared `&:focus-within` affordance (same as the comment box), and
          // stay lit while dirty so an unsaved edit still reads as active even if
          // focus has moved to the Save/Cancel buttons.
          border: "1px solid",
          borderColor: dirty ? "primary.main" : "transparent",
          color: isEmpty ? "text.disabled" : "text.primary",
          cursor: editing ? "text" : "pointer",
          transition: "border-color 120ms ease, background-color 120ms ease",
          "&:hover": { bgcolor: editing ? "transparent" : "action.hover" },
          "&:focus-within": { borderColor: "primary.main" },
          ...textSx,
          "& .MuiInputBase-input": { p: 0, cursor: "inherit" },
        }}
      />
      {commit === "explicit" && dirty && (
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
// Subject and Description each in their own SectionPanel, edited via
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
