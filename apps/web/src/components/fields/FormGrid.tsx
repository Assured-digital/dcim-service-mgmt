import { Box, type SxProps, type Theme } from "@mui/material"
import React from "react"

// ─────────────────────────────────────────────────────────────────────────────
// FormGrid — the standard form body layout: a responsive 2-column grid (single
// column on mobile). Short fields (selects, dates) occupy one cell and pair up
// two-across, filling their column (grid items stretch — no bunching / dead
// space). Long fields (title, description, text areas) opt into spanning both
// columns via the kit's `span="full"` prop. Replaces ad-hoc Stack + row nesting.
// ─────────────────────────────────────────────────────────────────────────────

export interface FormGridProps {
  children: React.ReactNode
  // Column count on sm+ (default 2). Mobile (xs) is always a single column.
  columns?: number
  sx?: SxProps<Theme>
}

export function FormGrid({ children, columns = 2, sx }: FormGridProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        // minmax(0, 1fr) so long values never blow the column width out.
        gridTemplateColumns: { xs: "1fr", sm: `repeat(${columns}, minmax(0, 1fr))` },
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}
