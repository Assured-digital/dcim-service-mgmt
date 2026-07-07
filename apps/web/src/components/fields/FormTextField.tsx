import React from "react"
import { Box, TextField, Typography, type TextFieldProps } from "@mui/material"

// ─────────────────────────────────────────────────────────────────────────────
// FieldLabel — the static field label rendered ABOVE a control (enterprise form
// style), replacing MUI's floating/notch label that animates up on focus. Mirrors
// the label style the detail pages already use for their inline-edit sections
// (small, medium-weight, secondary) so forms and records read consistently.
// ─────────────────────────────────────────────────────────────────────────────

export function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      sx={{
        display: "block",
        mb: 0.625,
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1.4,
        letterSpacing: "0.01em",
        color: "text.secondary",
      }}
    >
      {children}
      {required ? (
        <Box component="span" sx={{ color: "error.main", ml: 0.5 }}>
          *
        </Box>
      ) : null}
    </Typography>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FormTextField — the house text input. A thin wrapper over MUI TextField that
// pins our form-field defaults in ONE place: outlined variant, full width, and a
// STATIC label rendered above the field (no floating label). Every other prop
// stays overridable (spread last), so this is a drop-in for a raw TextField while
// giving us a single seam for field styling app-wide.
//
// When `label` is given it renders above via FieldLabel and is NOT passed to the
// underlying TextField (so MUI draws no notch/floating label). Omit `label` to get
// a bare outlined field (e.g. an unlabelled note box). `helperText`/`error` still
// pass through and render beneath the control.
//
// `span="full"` makes the field span all columns of an enclosing FormGrid (for
// long/free-text fields); omit it for a single-cell field that pairs two-across.
// ─────────────────────────────────────────────────────────────────────────────

// Grid-layout prop shared by every kit field, forwarded down to FormTextField's
// wrapper. Kept as its own type so EnumSelect/DateField/AssigneePicker can accept
// `span` and pass it through without re-declaring it.
export interface FormLayoutProps {
  span?: "full"
}

export type FormTextFieldProps = TextFieldProps & FormLayoutProps

export function FormTextField({ label, required, id, span, ...props }: FormTextFieldProps) {
  const reactId = React.useId()
  const inputId = id ?? (label != null ? `field-${reactId}` : undefined)
  const wrapperSx = span === "full" ? { gridColumn: "1 / -1" } : undefined
  const control = (
    <TextField variant="outlined" fullWidth required={required} id={inputId} {...props} />
  )
  if (label == null) {
    return wrapperSx ? <Box sx={wrapperSx}>{control}</Box> : control
  }
  return (
    <Box sx={wrapperSx}>
      <FieldLabel htmlFor={inputId} required={required}>
        {label}
      </FieldLabel>
      {control}
    </Box>
  )
}
