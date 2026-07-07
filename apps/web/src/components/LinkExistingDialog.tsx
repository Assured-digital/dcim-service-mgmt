import React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import SearchIcon from "@mui/icons-material/Search"
import { useNotification } from "./NotificationProvider"
import {
  searchLinkRecords, setParentLink, visualForType, type LinkRecordType,
} from "../lib/linkedRecords"

// ─────────────────────────────────────────────────────────────────────────────
// LinkExistingDialog — attach an EXISTING work item (task/sr/risk/issue) to a DCIM
// parent (Asset/Cabinet/Site) by setting its linkedEntity* pointer. Pick a type,
// search, click a result to link. Records already linked here are filtered out.
// Stays open so several can be linked in one go.
// ─────────────────────────────────────────────────────────────────────────────

const LINK_TYPES: { type: LinkRecordType; label: string }[] = [
  { type: "task", label: "Tasks" },
  { type: "service_request", label: "Service requests" },
  { type: "risk", label: "Risks" },
  { type: "issue", label: "Issues" },
]

export function LinkExistingDialog({
  open,
  onClose,
  parentType,
  parentId,
  parentLabel,
  existingIds,
  onLinked,
}: {
  open: boolean
  onClose: () => void
  parentType: "Asset" | "Cabinet" | "Site"
  parentId: string
  parentLabel: string
  existingIds: string[]
  onLinked: () => Promise<void> | void
}) {
  const { notify } = useNotification()
  const [type, setType] = React.useState<LinkRecordType>("task")
  const [search, setSearch] = React.useState("")
  const [q, setQ] = React.useState("")
  const [linkingId, setLinkingId] = React.useState<string | null>(null)
  // Records linked during this dialog session — hidden immediately for snappy feedback.
  const [justLinked, setJustLinked] = React.useState<Set<string>>(new Set())

  // Reset per-open.
  React.useEffect(() => {
    if (!open) return
    setType("task")
    setSearch("")
    setQ("")
    setJustLinked(new Set())
  }, [open])

  // Debounce the search box into the query key.
  React.useEffect(() => {
    const id = setTimeout(() => setQ(search), 250)
    return () => clearTimeout(id)
  }, [search])

  const results = useQuery({
    queryKey: ["link-search", type, q],
    queryFn: () => searchLinkRecords(type, q),
    enabled: open,
  })

  const hidden = React.useMemo(() => new Set([...existingIds, ...justLinked]), [existingIds, justLinked])
  const rows = (results.data ?? []).filter((r) => !hidden.has(r.id))

  async function handleLink(childId: string) {
    setLinkingId(childId)
    try {
      await setParentLink({ childType: type, childId, parentType, parentId })
      setJustLinked((s) => new Set(s).add(childId))
      notify.success("Record linked")
      await onLinked()
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to link record")
    } finally {
      setLinkingId(null)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, pb: 1.5 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>Link existing record</Typography>
          <Typography sx={{ fontSize: 14, color: "text.disabled" }}>›</Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {parentLabel}
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={type}
            onChange={(_e, v) => { if (v) setType(v) }}
            sx={{ flexWrap: "wrap", "& .MuiToggleButton-root": { textTransform: "none", fontSize: 12, px: 1.25, py: 0.5 } }}
          >
            {LINK_TYPES.map((t) => (
              <ToggleButton key={t.type} value={t.type}>{t.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>

          <TextField
            size="small"
            autoFocus
            placeholder="Search by reference or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: "text.tertiary", mr: 1 }} /> }}
          />

          <Box sx={{ maxHeight: 340, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
            {results.isLoading ? (
              <Box sx={{ p: 2 }}><Typography sx={{ fontSize: 12, color: "text.tertiary" }}>Searching…</Typography></Box>
            ) : rows.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>
                  {q ? "No matching records" : "No records available to link"}
                </Typography>
              </Box>
            ) : (
              rows.map((r) => {
                const v = visualForType(r.type)
                const Icon = v.Icon
                const busy = linkingId === r.id
                return (
                  <Stack
                    key={r.id}
                    direction="row"
                    alignItems="center"
                    spacing={1.25}
                    onClick={() => { if (!busy) handleLink(r.id) }}
                    sx={{
                      px: "12px", py: "9px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
                      borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { borderBottom: "none" },
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Box sx={{ width: 26, height: 26, borderRadius: "8px", bgcolor: v.bg, color: v.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon sx={{ fontSize: 14 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.title}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, color: "text.tertiary", fontFamily: "monospace" }}>{r.reference}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 11, color: "primary.main", fontWeight: 600, flexShrink: 0 }}>
                      {busy ? "Linking…" : "Link"}
                    </Typography>
                  </Stack>
                )
              })
            )}
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
