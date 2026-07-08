import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, CircularProgress, InputBase, Typography } from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import { getSelectedClientId } from "../lib/scope"
import { globalSearch, SEARCH_TYPE_LABEL, SEARCH_TYPE_ORDER, type SearchResult } from "../lib/search"

// Global search input for the top bar. Client-scoped + entitlement-filtered by
// the backend; renders grouped, deep-linking results in a dropdown.
export default function GlobalSearchBar({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [q, setQ] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const clientId = getSelectedClientId() ?? ""

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250)
    return () => clearTimeout(t)
  }, [q])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const enabled = debounced.trim().length >= 2
  const { data, isFetching } = useQuery({
    queryKey: ["global-search", clientId, debounced],
    queryFn: () => globalSearch(debounced),
    enabled,
    staleTime: 10_000
  })

  function go(r: SearchResult) {
    onNavigate(r.detailPath)
    setQ(""); setDebounced(""); setOpen(false)
  }

  const groups = SEARCH_TYPE_ORDER
    .map((t) => ({ type: t, rows: data?.resultsByType?.[t] ?? [] }))
    .filter((g) => g.rows.length > 0)

  const showDropdown = open && enabled

  return (
    <Box ref={rootRef} sx={{ position: "relative", width: 240, flexShrink: 0 }}>
      <Box sx={{
        display: "flex", alignItems: "center", gap: "6px", px: "10px", height: 34,
        bgcolor: "rgba(255,255,255,0.06)", borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.08)",
        "&:focus-within": { borderColor: "rgba(125,180,245,0.5)", bgcolor: "rgba(255,255,255,0.09)" }
      }}>
        <SearchIcon sx={{ fontSize: 17, color: "#64748b" }} />
        <InputBase
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search…"
          sx={{ flex: 1, fontSize: 13, color: "#e2e8f0", "& input::placeholder": { color: "#64748b", opacity: 1 } }}
        />
        {isFetching ? <CircularProgress size={13} sx={{ color: "#64748b" }} /> : null}
      </Box>

      {showDropdown ? (
        <Box sx={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 1600,
          width: 340, maxHeight: 420, overflowY: "auto",
          bgcolor: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)", py: "6px"
        }}>
          {groups.length === 0 ? (
            <Typography sx={{ px: "14px", py: "10px", fontSize: 12.5, color: "#94a3b8" }}>
              {isFetching ? "Searching…" : `No results for “${debounced}”`}
            </Typography>
          ) : (
            groups.map((g) => (
              <Box key={g.type}>
                <Typography sx={{ px: "14px", pt: "8px", pb: "3px", fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#475569" }}>
                  {SEARCH_TYPE_LABEL[g.type]}
                </Typography>
                {g.rows.map((r) => (
                  <Box key={`${r.type}-${r.id}`} onClick={() => go(r)} sx={{
                    px: "14px", py: "7px", cursor: "pointer", display: "flex", alignItems: "baseline", gap: "8px",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.06)" }
                  }}>
                    {r.reference ? <Typography sx={{ fontSize: 11, color: "#7db4f5", fontFamily: "monospace", flexShrink: 0 }}>{r.reference}</Typography> : null}
                    <Typography sx={{ fontSize: 13, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</Typography>
                  </Box>
                ))}
              </Box>
            ))
          )}
        </Box>
      ) : null}
    </Box>
  )
}
