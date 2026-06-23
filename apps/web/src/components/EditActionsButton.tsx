import React from "react"
import { Button, ButtonGroup, Divider, IconButton, Menu, MenuItem, useTheme } from "@mui/material"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import { semanticToken } from "./shared/tokens/colors"

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
  const theme = useTheme()

  return (
    <>
      <ButtonGroup size="small" variant="outlined">
        <Button
          onClick={onEdit}
          disabled={disabled}
          startIcon={editIcon ?? <EditOutlinedIcon sx={{ fontSize: 13 }} />}
          sx={{ textTransform: "none", fontSize: 12, borderColor: theme.palette.divider, color: theme.palette.text.secondary }}
        >
          {editLabel}
        </Button>
        {hasActions ? (
          <IconButton
            size="small"
            disabled={disabled}
            onClick={e => setAnchor(e.currentTarget)}
            sx={{ border: `1px solid ${theme.palette.divider}`, borderLeft: "none", borderRadius: "0 4px 4px 0", px: "4px" }}
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
                sx={{ fontSize: 13, ...(a.danger ? { color: semanticToken("danger", theme.palette.mode).text } : null) }}
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
