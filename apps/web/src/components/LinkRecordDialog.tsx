import React from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material"
import {
  createRecordLink,
  LINK_RECORD_TYPES,
  LinkRecordSummary,
  LinkRecordType,
  searchLinkRecords,
  visualForType,
} from "../lib/linkedRecords"

interface LinkRecordDialogProps {
  open: boolean
  onClose: () => void
  sourceType: LinkRecordType
  sourceId: string
  onLinked: () => void
}

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function LinkRecordDialog({
  open,
  onClose,
  sourceType,
  sourceId,
  onLinked,
}: LinkRecordDialogProps) {
  // Default the picker to the first type that isn't the source's own type.
  const initialType = React.useMemo<LinkRecordType>(
    () => LINK_RECORD_TYPES.find((t) => t !== sourceType) ?? LINK_RECORD_TYPES[0],
    [sourceType]
  )
  const [type, setType] = React.useState<LinkRecordType>(initialType)
  const [query, setQuery] = React.useState("")
  const [error, setError] = React.useState("")
  const debouncedQuery = useDebounced(query)

  // Reset state each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setType(initialType)
      setQuery("")
      setError("")
    }
  }, [open, initialType])

  const { data: results, isFetching } = useQuery({
    queryKey: ["link-search", type, debouncedQuery],
    queryFn: () => searchLinkRecords(type, debouncedQuery),
    enabled: open,
  })

  const linkMutation = useMutation({
    mutationFn: (target: LinkRecordSummary) =>
      createRecordLink({ aType: sourceType, aId: sourceId, bType: target.type, bId: target.id }),
    onSuccess: () => {
      onLinked()
      onClose()
    },
    onError: (err: any) => {
      const msg = Array.isArray(err?.message) ? err.message.join(", ") : err?.message
      setError(msg || "Could not create link")
    },
  })

  // Hide the source record itself from results.
  const visibleResults = (results ?? []).filter(
    (r) => !(r.type === sourceType && r.id === sourceId)
  )

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Link record</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 1, mb: 1.5, mt: 0.5 }}>
          <TextField
            select
            size="small"
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as LinkRecordType)}
            sx={{ minWidth: 160 }}
          >
            {LINK_RECORD_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {visualForType(t).label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            fullWidth
            autoFocus
            label="Search by reference or title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Box>

        {error ? (
          <Typography variant="caption" color="error" sx={{ display: "block", mb: 1 }}>
            {error}
          </Typography>
        ) : null}

        <Box sx={{ minHeight: 180, maxHeight: 320, overflowY: "auto" }}>
          {isFetching ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={22} />
            </Box>
          ) : visibleResults.length === 0 ? (
            <Typography
              variant="caption"
              sx={{ color: "text.tertiary", display: "block", py: 2, textAlign: "center" }}
            >
              No matching records
            </Typography>
          ) : (
            visibleResults.map((r) => {
              const visual = visualForType(r.type)
              const Icon = visual.Icon
              return (
                <Box
                  key={`${r.type}-${r.id}`}
                  onClick={() => !linkMutation.isPending && linkMutation.mutate(r)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    py: 0.75,
                    px: 0.5,
                    borderRadius: 1,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: 1,
                      bgcolor: visual.bg,
                      color: visual.fg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 14 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.title}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: "text.tertiary" }}>
                      {r.reference} · {r.status}
                    </Typography>
                  </Box>
                </Box>
              )
            })
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
