import { useTheme, type TextFieldProps } from "@mui/material"
import { FormTextField, type FormLayoutProps } from "./FormTextField"

// ─────────────────────────────────────────────────────────────────────────────
// DateField — native date / datetime input for the INLINE FORM case (create
// modals, filter rows). Bakes in the theming DueDatePopover already solved: the
// shrunk label (so the placeholder never overlaps the value) plus
// `colorScheme: <mode>` on the input, which flips the browser's native picker
// chrome to dark in dark mode. DueDatePopover stays the tool for the popover
// case; this is its flat-field sibling.
// ─────────────────────────────────────────────────────────────────────────────

export interface DateFieldProps
  extends Omit<TextFieldProps, "type" | "value" | "onChange">,
    FormLayoutProps {
  value: string
  // eslint-disable-next-line no-unused-vars
  onChange: (value: string) => void
  type?: "date" | "datetime-local"
}

export function DateField({
  value,
  onChange,
  type = "date",
  InputLabelProps,
  inputProps,
  ...rest
}: DateFieldProps) {
  const theme = useTheme()
  return (
    <FormTextField
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      InputLabelProps={{ shrink: true, ...InputLabelProps }}
      inputProps={{ sx: { colorScheme: theme.palette.mode }, ...inputProps }}
      {...rest}
    />
  )
}
