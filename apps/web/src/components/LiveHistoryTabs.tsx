import { Box, Stack } from "@mui/material"

// Shared Live / History sub-tab strip for record lists (Create-surface / historical
// records work). Underline-tab style with per-view counts. Live = active records,
// History = terminal-status (closed/resolved/retired/…) records — see lib/recordStatus.
// One component so every list that separates live from historical looks identical.
export type LiveHistoryView = "live" | "history"

export function LiveHistoryTabs({
  view,
  onChange,
  liveCount,
  historyCount,
}: {
  view: LiveHistoryView
  // eslint-disable-next-line no-unused-vars
  onChange: (next: LiveHistoryView) => void
  liveCount: number
  historyCount: number
}) {
  return (
    <Stack direction="row" sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
      {(["live", "history"] as const).map((v) => {
        const active = view === v
        const count = v === "live" ? liveCount : historyCount
        return (
          <Box
            key={v}
            onClick={() => onChange(v)}
            sx={{
              px: "12px", py: "8px", cursor: "pointer", fontSize: 12.5, fontWeight: 500, mb: "-1px",
              color: active ? "primary.main" : "text.secondary",
              borderBottom: "2px solid", borderBottomColor: active ? "primary.main" : "transparent",
              display: "flex", alignItems: "center", gap: "6px",
              "&:hover": { color: active ? "primary.main" : "text.primary" },
            }}
          >
            {v === "live" ? "Live" : "History"}
            <Box
              sx={{
                px: "5px", py: "1px", borderRadius: "4px", fontSize: 10, fontWeight: 600,
                bgcolor: active ? "action.selected" : "action.hover",
                color: active ? "primary.main" : "text.secondary",
              }}
            >
              {count}
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}
