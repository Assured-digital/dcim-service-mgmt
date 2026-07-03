import React from "react"
import { Box, Button, Checkbox, Menu, MenuItem, Typography } from "@mui/material"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"

export type ChipOption = {
  key: string
  label: string
  count: number
  glyph?: { color: string; shape: "square" | "dot" }
}

// One filter facet: a chip-style button opening a multi-select menu. Stays open
// across toggles so several options can be picked in one visit. The DCIM list
// pages' standard filter affordance (paired with ListToolbar/SearchField).
export function FilterChip({ label, options, selected, onToggle, onClear }: {
  label: string
  options: ChipOption[]
  selected: Set<string>
  onToggle: (key: string) => void
  onClear: () => void
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const active = options.reduce((n, o) => n + (selected.has(o.key) ? 1 : 0), 0)
  if (options.length === 0 && active === 0) return null
  return (
    <>
      <Button size="small" onClick={e => setAnchor(e.currentTarget)}
        endIcon={<KeyboardArrowDownIcon sx={{ fontSize: "14px !important", ml: "-3px" }} />}
        sx={{
          textTransform: "none", fontSize: 12, fontWeight: active ? 700 : 500, px: "10px", py: "2px",
          borderRadius: "16px", border: "1px solid", minWidth: 0,
          borderColor: active ? "rgba(29,78,216,0.4)" : "divider",
          bgcolor: active ? "rgba(29,78,216,0.1)" : "transparent",
          color: active ? "primary.main" : "text.secondary",
        }}>
        {label}{active ? ` · ${active}` : ""}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 210, maxHeight: 380 } } }}>
        {options.map(o => (
          <MenuItem key={o.key} dense onClick={() => onToggle(o.key)} sx={{ py: "3px" }}>
            <Checkbox checked={selected.has(o.key)} size="small" sx={{ p: 0, mr: "8px", "& .MuiSvgIcon-root": { fontSize: 15 } }} />
            {o.glyph ? (
              <Box sx={{
                width: o.glyph.shape === "square" ? 9 : 8, height: o.glyph.shape === "square" ? 9 : 8,
                borderRadius: o.glyph.shape === "square" ? "3px" : "50%", bgcolor: o.glyph.color, mr: "7px", flexShrink: 0,
              }} />
            ) : null}
            <Typography sx={{ flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</Typography>
            <Typography sx={{ fontSize: 10.5, color: "text.tertiary", ml: "10px", fontVariantNumeric: "tabular-nums" }}>{o.count}</Typography>
          </MenuItem>
        ))}
        {active > 0 ? (
          <MenuItem dense onClick={() => { onClear(); setAnchor(null) }} sx={{ py: "4px", borderTop: "1px solid", borderColor: "divider", mt: "4px" }}>
            <Typography sx={{ fontSize: 12, color: "primary.main", fontWeight: 600 }}>Clear {label.toLowerCase()}</Typography>
          </MenuItem>
        ) : null}
      </Menu>
    </>
  )
}
