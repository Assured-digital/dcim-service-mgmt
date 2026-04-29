import React from "react"
import { Button, ButtonGroup, Divider, IconButton, Menu, MenuItem } from "@mui/material"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"

export type EditAction =
  | { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { divider: true }

type Props = {
  editLabel?: string
  editIcon?: React.ReactNode
  onEdit: () => void
  actions?: EditAction[]
  disabled?: boolean
}

export function EditActionsButton({ editLabel = "Edit", editIcon, onEdit, actions = [], disabled }: Props) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const hasActions = actions.length > 0

  return (
    <>
      <ButtonGroup size="small" variant="outlined">
        <Button
          onClick={onEdit}
          disabled={disabled}
          startIcon={editIcon ?? <EditOutlinedIcon sx={{ fontSize: 13 }} />}
          sx={{ textTransform: "none", fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}
        >
          {editLabel}
        </Button>
        {hasActions ? (
          <IconButton
            size="small"
            disabled={disabled}
            onClick={e => setAnchor(e.currentTarget)}
            sx={{ border: "1px solid #e2e8f0", borderLeft: "none", borderRadius: "0 4px 4px 0", px: "4px" }}
          >
            <ArrowDropDownIcon fontSize="small" />
          </IconButton>
        ) : null}
      </ButtonGroup>

      {hasActions ? (
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
          {actions.map((a, i) =>
            "divider" in a ? (
              <Divider key={`d-${i}`} />
            ) : (
              <MenuItem
                key={a.label}
                disabled={a.disabled}
                onClick={() => { setAnchor(null); a.onClick() }}
                sx={{ fontSize: 13, ...(a.danger ? { color: "#dc2626" } : null) }}
              >
                {a.label}
              </MenuItem>
            )
          )}
        </Menu>
      ) : null}
    </>
  )
}
