import React from "react"
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material"
import type { Transition } from "./WorkflowStrip"
import { useAssignableUsers } from "../../lib/useAssignableUsers"

interface TransitionDialogProps {
  open: boolean
  transition: Transition | null
  onConfirm: (data: Record<string, string>) => void
  onClose: () => void
}

function TransitionDialogImpl({
  open,
  transition,
  onConfirm,
  onClose,
}: TransitionDialogProps) {
  const [values, setValues] = React.useState<Record<string, string>>({})

  // Shared assignable-users source for any "assignee" field. Cheap to call on
  // every render — cached and scoped to the current client by the hook.
  const assignableQuery = useAssignableUsers()
  const assignableUsers = assignableQuery.data ?? []

  React.useEffect(() => {
    if (open) setValues({})
  }, [open, transition])

  const handleChange = React.useCallback(
    (key: string) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const next = e.target.value
        setValues((prev) => ({ ...prev, [key]: next }))
      },
    []
  )

  const handleConfirm = React.useCallback(() => {
    onConfirm(values)
  }, [onConfirm, values])

  const handleClose = React.useCallback(() => {
    onClose()
  }, [onClose])

  const fields = transition?.dialogFields ?? []
  const allRequiredFilled = React.useMemo(() => {
    return fields
      .filter((f) => f.required)
      .every((f) => {
        const v = values[f.key]
        return typeof v === "string" && v.trim().length > 0
      })
  }, [fields, values])

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{transition ? transition.label : "Confirm"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {fields.map((field) => {
            if (field.type === "assignee") {
              return (
                <TextField
                  key={field.key}
                  select
                  fullWidth
                  label={field.label}
                  required={field.required}
                  value={values[field.key] ?? ""}
                  onChange={handleChange(field.key)}
                >
                  {!field.required && (
                    <MenuItem value="">Unassigned</MenuItem>
                  )}
                  {assignableUsers.map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.displayName}
                    </MenuItem>
                  ))}
                </TextField>
              )
            }
            if (field.type === "select") {
              return (
                <TextField
                  key={field.key}
                  select
                  fullWidth
                  label={field.label}
                  required={field.required}
                  value={values[field.key] ?? ""}
                  onChange={handleChange(field.key)}
                >
                  {(field.options ?? []).map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      {opt}
                    </MenuItem>
                  ))}
                </TextField>
              )
            }
            return (
              <TextField
                key={field.key}
                fullWidth
                label={field.label}
                required={field.required}
                multiline={field.type === "textarea"}
                minRows={field.type === "textarea" ? 3 : undefined}
                value={values[field.key] ?? ""}
                onChange={handleChange(field.key)}
              />
            )
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color={transition?.color ?? "primary"}
          disabled={!allRequiredFilled}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export const TransitionDialog = React.memo(TransitionDialogImpl)
