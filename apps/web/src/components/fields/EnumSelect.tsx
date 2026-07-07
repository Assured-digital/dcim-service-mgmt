import { MenuItem, type TextFieldProps } from "@mui/material"
import { FormTextField, type FormLayoutProps } from "./FormTextField"

export interface EnumOption {
  value: string
  label: string
}

// ─────────────────────────────────────────────────────────────────────────────
// EnumSelect — a labelled single-select built on FormTextField (select mode).
// Replaces the repeated `<TextField select>…{list.map(v => <MenuItem/>)}` boiler-
// plate scattered across the forms. Give it typed { value, label } options.
//
// `includeEmpty` renders a leading empty-value MenuItem with that label (e.g.
// "Unassigned" / "None") — omit it for a required pick with no empty option.
// onChange hands back the selected value string directly (not the raw event),
// since every call site immediately reads e.target.value anyway.
// ─────────────────────────────────────────────────────────────────────────────

export interface EnumSelectProps
  extends Omit<TextFieldProps, "select" | "value" | "onChange">,
    FormLayoutProps {
  value: string
  // eslint-disable-next-line no-unused-vars
  onChange: (value: string) => void
  options: EnumOption[]
  includeEmpty?: string
}

export function EnumSelect({
  value,
  onChange,
  options,
  includeEmpty,
  SelectProps,
  ...rest
}: EnumSelectProps) {
  return (
    <FormTextField
      select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // With no floating label, an empty value would render blank; displayEmpty
      // makes the "" MenuItem (e.g. "Unassigned") show at rest.
      SelectProps={{ displayEmpty: includeEmpty !== undefined, ...SelectProps }}
      {...rest}
    >
      {includeEmpty !== undefined ? (
        <MenuItem value="">{includeEmpty}</MenuItem>
      ) : null}
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </FormTextField>
  )
}
