import React from "react"
import { Box, Button, InputAdornment, TextField } from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"

// ── The DCIM list-surface toolbar kit ────────────────────────────────────────
// One look for every list page's top bar: container, search input, and the two
// button weights. Pages compose these instead of hand-rolling paddings/styles
// (they had drifted: four different toolbar recipes, two search inputs, solid
// primary fills against the app's tinted-chip convention).

// The toolbar row itself: paper bg, divider bottom, wrap-friendly.
export function ListToolbar({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={{
      px: "16px", py: "8px", minHeight: 49, bgcolor: "background.paper",
      borderBottom: "1px solid", borderColor: "divider",
      display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flexShrink: 0,
      ...sx,
    }}>
      {children}
    </Box>
  )
}

// Canonical search input — instant, debounced internally (no commit step).
// Controlled: the page owns the raw input value (so e.g. "Clear all" can wipe
// it); onSearch fires with the trimmed value after the debounce.
export function SearchField({ placeholder, value, onValueChange, onSearch, width = 300, debounceMs = 250 }: {
  placeholder: string
  value: string
  onValueChange: (value: string) => void
  onSearch: (query: string) => void
  width?: number
  debounceMs?: number
}) {
  React.useEffect(() => {
    const t = setTimeout(() => onSearch(value.trim()), debounceMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs])
  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={e => onValueChange(e.target.value)}
      sx={{ width }}
      InputProps={{
        startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: "text.tertiary" }} /></InputAdornment>,
        sx: { fontSize: 12.5, bgcolor: "background.default", height: 32 },
      }}
    />
  )
}

// Toolbar buttons: "primary" = tinted (never solid — app convention), "default"
// = grey outline. Both small/dense to sit in the toolbar row.
export function ToolbarButton({ variant = "default", sx, ...props }: {
  variant?: "default" | "primary"
} & Omit<React.ComponentProps<typeof Button>, "variant">) {
  const look = variant === "primary"
    ? {
        bgcolor: "rgba(29,78,216,0.12)", color: "primary.main",
        border: "1px solid rgba(29,78,216,0.35)",
        "&:hover": { bgcolor: "rgba(29,78,216,0.2)", border: "1px solid rgba(29,78,216,0.5)" },
      }
    : {
        color: "text.secondary", border: "1px solid", borderColor: "divider",
        "&:hover": { borderColor: "primary.main", color: "text.primary", bgcolor: "transparent" },
      }
  return (
    <Button size="small" disableElevation
      sx={{ textTransform: "none", fontSize: 12, fontWeight: 600, px: "10px", py: "3px", borderRadius: "7px", minWidth: 0, ...look, ...sx }}
      {...props}
    />
  )
}

// Tinted segmented control (Plan/Grid, lens pickers, Front/Rear …) — replaces
// the three hand-rolled variants and MUI ToggleButtonGroup.
export function SegmentedToggle<T extends string>({ options, value, onChange, sx }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  sx?: object
}) {
  return (
    <Box sx={{ display: "inline-flex", gap: "2px", p: "2px", borderRadius: "8px", border: "1px solid", borderColor: "divider", bgcolor: "background.default", ...sx }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <Button key={o.value} size="small" onClick={() => onChange(o.value)} disableElevation
            sx={{
              textTransform: "none", fontSize: 12, fontWeight: on ? 700 : 500, px: "11px", py: "1px",
              minWidth: 0, borderRadius: "6px",
              bgcolor: on ? "rgba(29,78,216,0.12)" : "transparent",
              color: on ? "primary.main" : "text.secondary",
              "&:hover": { bgcolor: on ? "rgba(29,78,216,0.16)" : "action.hover" },
            }}>
            {o.label}
          </Button>
        )
      })}
    </Box>
  )
}
