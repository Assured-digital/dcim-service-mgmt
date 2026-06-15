import React from "react"
import { Box, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material"
import { TypeBadge, type BadgeKind } from "../primitives/TypeBadge"

// Generic "new record" type picker — a small dialog of clickable type cards
// (badge + title + subtitle). Shared by the Service Desk queue ("New ticket")
// and Risks & Issues ("New record"); parametrised by title + options so each
// surface supplies its own record kinds and copy.
export type RecordTypeOption = { kind: BadgeKind; title: string; subtitle: string }

export function RecordTypePicker({
  open, onClose, onPick, title, options,
}: {
  open: boolean
  onClose: () => void
  onPick: (kind: BadgeKind) => void
  title: string
  options: RecordTypeOption[]
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack gap={1.25} sx={{ pt: 0.5, pb: 1 }}>
          {options.map(o => (
            <Box
              key={o.kind}
              onClick={() => { onClose(); onPick(o.kind) }}
              sx={{
                display: "flex", alignItems: "center", gap: 1.5,
                p: 1.5, borderRadius: 1.5, cursor: "pointer",
                border: "1px solid #e2e8f0",
                "&:hover": { bgcolor: "#f8fafc", borderColor: "#cbd5e1" }
              }}
            >
              <TypeBadge kind={o.kind} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{o.title}</Typography>
                <Typography sx={{ fontSize: 12, color: "#64748b" }}>{o.subtitle}</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
