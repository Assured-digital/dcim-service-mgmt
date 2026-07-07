import { useAssignableUsers, type AssignableUser } from "../../lib/useAssignableUsers"
import { EnumSelect, type EnumSelectProps } from "./EnumSelect"

// ─────────────────────────────────────────────────────────────────────────────
// AssigneePicker — the ONE assignee select. Wraps useAssignableUsers() + Enum-
// Select, mapping the assignable set to { value: id, label: displayName }. This
// replaces the ~45 hand-rolled `users.map(u => <MenuItem>)` copies.
//
// By default it self-fetches via the shared hook (react-query dedupes on the
// ["users-assignable"] key). A caller that already holds the list — e.g. the
// Task quick-detail modal, handed `users` from its parent — can pass `users` to
// skip re-deriving it. includeUnassigned adds the leading "" → "Unassigned"
// option (the common case; disable it for a mandatory assignee).
// ─────────────────────────────────────────────────────────────────────────────

export interface AssigneePickerProps
  extends Omit<EnumSelectProps, "options" | "includeEmpty"> {
  users?: AssignableUser[]
  includeUnassigned?: boolean
  // Label for the leading empty option. Defaults to "Unassigned"; override for
  // user pickers whose empty state means something else (e.g. "Use current user"
  // on a Maintenance "Performed by" picker).
  emptyLabel?: string
}

export function AssigneePicker({
  users,
  includeUnassigned = true,
  emptyLabel = "Unassigned",
  label = "Assignee",
  ...rest
}: AssigneePickerProps) {
  // Hook must run unconditionally; when `users` is supplied we simply prefer it.
  const { data: fetched = [] } = useAssignableUsers()
  const list = users ?? fetched
  const options = list.map((u) => ({ value: u.id, label: u.displayName }))

  return (
    <EnumSelect
      label={label}
      options={options}
      includeEmpty={includeUnassigned ? emptyLabel : undefined}
      {...rest}
    />
  )
}
