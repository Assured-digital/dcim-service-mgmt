import React from "react"
import {
  Box, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, useMediaQuery, useTheme,
  type SxProps, type Theme,
} from "@mui/material"

// ── Shared responsive list ───────────────────────────────────────────────────
// One table definition that renders as a real <Table> on md+ and collapses into
// a stack of tappable cards on xs (phones). Built once so any wide list page can
// go phone-usable without a per-page table→card rewrite — the same consolidation
// idea as the shared cells/pills. The md+ branch adds NOTHING to <TableCell>
// beyond the caller's `cellSx`/`align`, so a converted page's desktop table stays
// byte-identical to its hand-written original.
//
// Card layout (xs): the `title`-role column is the prominent left field, the
// `status`-role column is the right-aligned pill, and every other (non-hidden)
// column flows into a wrapped, `·`-separated muted meta row. Columns with no
// `card` config (or `card.hide`) are table-only.

export type ResponsiveColumn<T> = {
  id: string
  header: React.ReactNode
  render: (row: T) => React.ReactNode
  /** Applied to the <TableCell> on md+ (e.g. monospace/weight) — keeps the desktop table identical. */
  cellSx?: SxProps<Theme>
  align?: "left" | "right"
  /** Card role on xs. Omit (or `hide`) to keep a column table-only. */
  card?: { role: "title" | "status" | "meta"; hide?: boolean }
}

export type ResponsiveListProps<T> = {
  columns: ResponsiveColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
}

export function ResponsiveList<T>({
  columns, rows, getRowKey, onRowClick,
}: ResponsiveListProps<T>) {
  const theme = useTheme()
  const isPhone = useMediaQuery(theme.breakpoints.down("md"))

  // ── Phone: stacked cards ─────────────────────────────────────────────────
  if (isPhone) {
    const titleCol = columns.find(c => c.card?.role === "title")
    const statusCol = columns.find(c => c.card?.role === "status")
    const metaCols = columns.filter(
      c => c.card && !c.card.hide && c.card.role === "meta"
    )

    return (
      <Stack spacing={1} sx={{ p: "8px" }}>
        {rows.map(row => (
          <Box
            key={getRowKey(row)}
            onClick={() => onRowClick?.(row)}
            sx={{
              bgcolor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              px: "16px", py: "12px",
              cursor: onRowClick ? "pointer" : "default",
              transition: "all 0.1s",
              "&:hover": onRowClick
                ? { borderColor: "#cbd5e1", boxShadow: "0 2px 8px rgba(15,23,42,0.06)" }
                : undefined,
            }}
          >
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap="8px">
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {titleCol ? titleCol.render(row) : null}
              </Box>
              {statusCol ? (
                <Box sx={{ flexShrink: 0 }}>{statusCol.render(row)}</Box>
              ) : null}
            </Stack>
            {metaCols.length > 0 ? (
              <Stack
                direction="row" alignItems="center" flexWrap="wrap" gap="6px"
                sx={{ mt: "8px" }}
              >
                {metaCols.map((col, i) => (
                  <React.Fragment key={col.id}>
                    {i > 0 ? (
                      <Typography sx={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1 }}>·</Typography>
                    ) : null}
                    <Box sx={{ minWidth: 0, color: "#64748b", fontSize: 12, lineHeight: 1.3 }}>
                      {col.render(row)}
                    </Box>
                  </React.Fragment>
                ))}
              </Stack>
            ) : null}
          </Box>
        ))}
      </Stack>
    )
  }

  // ── Desktop: the real table (unchanged from a hand-written one) ───────────
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            {columns.map(col => (
              <TableCell key={col.id} align={col.align}>{col.header}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow
              key={getRowKey(row)}
              onClick={() => onRowClick?.(row)}
              sx={{
                cursor: onRowClick ? "pointer" : "default",
                "&:hover": onRowClick ? { bgcolor: "#f8fafc" } : undefined,
              }}
            >
              {columns.map(col => (
                <TableCell key={col.id} align={col.align} sx={col.cellSx}>
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
