import React from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Stack, Typography,
} from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import LinkIcon from "@mui/icons-material/Link"
import { api } from "../../lib/api"
import { useNotification } from "../NotificationProvider"
import { useSelectedClient } from "../../lib/useSelectedClient"
import { FormTextField, EnumSelect, DateField, AssigneePicker, FormGrid } from "../fields"
import { RECORD_TYPE_CONFIG, type FieldDescriptor } from "./recordTypeConfig"

// ─────────────────────────────────────────────────────────────────────────────
// CreateRecordModal — the ONE shared create surface for the governed record
// types (Create Surface spec §1). Universal shell — client-first breadcrumb
// header, prominent Title, optional Description, a per-type Details block, an
// optional linked-record context, and a Create-another footer. Only the Details
// block + create wiring vary per type, driven by recordTypeConfig.
//
// Validation follows the spec: the submit button is NEVER disabled by validation
// (only briefly while the POST is in flight); an empty title surfaces an inline
// error under the field and refocuses it.
//
// The interactive linked-record PICKER (spec §3) is a separate track; for now the
// block only echoes a parent context passed in via linkedEntity* (as when the
// modal is opened from a detail page).
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRecordModalProps {
  open: boolean
  onClose: () => void
  recordType: string
  linkedEntityType?: string
  linkedEntityId?: string
  linkedEntityLabel?: string
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
  // Options for the config's asyncEnum fields, keyed by their `source` (e.g.
  // { assets: [...] } for Maintenance, { templates, sites } for Check). The caller
  // fetches these so the generic modal stays data-free.
  asyncOptions?: Record<string, { value: string; label: string }[]>
}

export function CreateRecordModal({
  open,
  onClose,
  recordType,
  linkedEntityType,
  linkedEntityId,
  linkedEntityLabel,
  onSuccess,
  navigateAfterCreate = true,
  asyncOptions,
}: CreateRecordModalProps) {
  const cfg = RECORD_TYPE_CONFIG[recordType]
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useNotification()
  const client = useSelectedClient()
  const titleRef = React.useRef<HTMLInputElement>(null)
  const descriptionRef = React.useRef<HTMLInputElement>(null)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [titleError, setTitleError] = React.useState<string | null>(null)
  const [descriptionError, setDescriptionError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [createAnother, setCreateAnother] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Reset to a clean form each time the modal opens (or the type changes).
  React.useEffect(() => {
    if (!open || !cfg) return
    setTitle("")
    setDescription("")
    setValues({ ...cfg.defaults })
    setTitleError(null)
    setDescriptionError(null)
    setFieldErrors({})
  }, [open, recordType]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return null

  const hasTitle = cfg.hasTitle !== false

  const setValue = (key: string, val: string) => {
    setValues((v) => ({ ...v, [key]: val }))
    setFieldErrors((e) => (e[key] ? { ...e, [key]: "" } : e))
  }

  const typeLower = cfg.label.toLowerCase()
  // Fields currently shown (a hidden showIf field is neither rendered nor required).
  const visibleFields = cfg.fields.filter((f) => !f.showIf || f.showIf(values))

  async function handleCreate() {
    if (hasTitle && !title.trim()) {
      setTitleError(`Give the ${typeLower} a title before creating it`)
      titleRef.current?.focus()
      return
    }
    if (cfg.requireDescription && !description.trim()) {
      setDescriptionError(`Give the ${typeLower} a description before creating it`)
      descriptionRef.current?.focus()
      return
    }
    // Required Details fields (the primary gate for the no-title types).
    const missing: Record<string, string> = {}
    for (const f of visibleFields) {
      if ("required" in f && f.required && !(values[f.key] ?? "").trim()) {
        missing[f.key] = "Required"
      }
    }
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing)
      return
    }
    setSaving(true)
    try {
      const payload = cfg.buildPayload(values, {
        title,
        description,
        linkedEntityType,
        linkedEntityId,
      })
      const res = await api.post<{ id: string }>(cfg.endpoint, payload)
      cfg.invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      notify.success(cfg.successMessage)
      await onSuccess?.()
      if (createAnother) {
        // Keep the modal + any parent link; clear the fields for the next entry.
        setTitle("")
        setDescription("")
        setValues({ ...cfg.defaults })
        setTitleError(null)
        setDescriptionError(null)
        setFieldErrors({})
        if (hasTitle) requestAnimationFrame(() => titleRef.current?.focus())
      } else {
        onClose()
        if (navigateAfterCreate && cfg.route) navigate(cfg.route(res.data.id))
      }
    } catch (e: any) {
      notify.error(e?.message ?? `Failed to create ${typeLower}`)
    } finally {
      setSaving(false)
    }
  }

  function renderField(f: FieldDescriptor) {
    const err = fieldErrors[f.key] || undefined
    switch (f.kind) {
      case "enum":
        return (
          <EnumSelect
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            onChange={(val) => setValue(f.key, val)}
            options={f.options}
            includeEmpty={f.includeEmpty}
            required={f.required}
            error={!!err}
            helperText={err}
            span={f.span}
          />
        )
      case "asyncEnum":
        return (
          <EnumSelect
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            onChange={(val) => setValue(f.key, val)}
            options={asyncOptions?.[f.source] ?? []}
            includeEmpty={f.includeEmpty}
            required={f.required}
            error={!!err}
            helperText={err}
            span={f.span}
          />
        )
      case "date":
        return (
          <DateField
            key={f.key}
            label={f.label}
            type={f.datetime ? "datetime-local" : "date"}
            value={values[f.key] ?? ""}
            onChange={(val) => setValue(f.key, val)}
            required={f.required}
            error={!!err}
            helperText={err}
            span={f.span}
          />
        )
      case "assignee":
        return (
          <AssigneePicker
            key={f.key}
            label={f.label ?? "Assignee"}
            value={values[f.key] ?? ""}
            onChange={(val) => setValue(f.key, val)}
            emptyLabel={f.emptyLabel}
            error={!!err}
            helperText={err}
            span={f.span}
          />
        )
      case "text":
        return (
          <FormTextField
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
            multiline={f.multiline}
            rows={f.rows}
            required={f.required}
            error={!!err}
            helperText={err}
            span={f.span}
          />
        )
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {/* Header — client-first breadcrumb (mirrors the Shell top bar). */}
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, pb: 1.5 }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
          {client ? (
            <>
              <Typography sx={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {client.name}
              </Typography>
              <Typography sx={{ fontSize: 14, color: "text.disabled" }}>›</Typography>
            </>
          ) : null}
          <Typography sx={{ fontSize: 14, color: "text.secondary", whiteSpace: "nowrap" }}>
            New {cfg.label}
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {/* Title — the prominent, action-prompt field. Omitted for the non-title
              types (Maintenance/Check), where required Details fields drive validation. */}
          {hasTitle ? (
            <FormTextField
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (titleError) setTitleError(null)
              }}
              placeholder={cfg.titlePlaceholder}
              inputRef={titleRef}
              autoFocus
              error={!!titleError}
              helperText={titleError ?? undefined}
              InputProps={{ sx: { fontSize: "1rem", fontWeight: 500 } }}
            />
          ) : null}

          {cfg.hasDescription ? (
            <FormTextField
              label="Description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (descriptionError) setDescriptionError(null)
              }}
              required={cfg.requireDescription}
              error={!!descriptionError}
              helperText={descriptionError ?? undefined}
              inputRef={descriptionRef}
              multiline
              rows={3}
            />
          ) : null}

          {/* Details — the only per-type block. */}
          <Box>
            <Typography
              variant="overline"
              sx={{ display: "block", color: "text.tertiary", mb: 1 }}
            >
              Details
            </Typography>
            <FormGrid>{visibleFields.map(renderField)}</FormGrid>
          </Box>

          {/* Linked record — echoes a parent context for now; interactive picker is track 2. */}
          {linkedEntityLabel ? (
            <Box>
              <Typography
                variant="overline"
                sx={{ display: "block", color: "text.tertiary", mb: 1 }}
              >
                Linked record
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{
                  px: 1.25,
                  py: 1,
                  borderRadius: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  color: "text.secondary",
                }}
              >
                <LinkIcon sx={{ fontSize: 16, color: "text.tertiary" }} />
                <Typography variant="body2">
                  Linked to <strong>{linkedEntityLabel}</strong>
                </Typography>
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={createAnother}
              onChange={(e) => setCreateAnother(e.target.checked)}
            />
          }
          label={<Typography variant="body2" color="text.secondary">Create another</Typography>}
        />
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? "Creating…" : `Create ${typeLower}`}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  )
}
