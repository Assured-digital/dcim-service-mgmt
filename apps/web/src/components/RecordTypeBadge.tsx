import { Box } from "@mui/material"
import { visualForType } from "../lib/linkedRecords"

// The record-type marker shown on the LEFT of a linked record: the type's icon and
// its label (Task / Risk / Service Request …) together in one tinted pill, so the
// type is legible at a glance without decoding the icon alone. Tinted in the type's
// own accent colour. One source of truth for every linked-record display
// (ParentLinkedRecords, LinkedRecordsContent).
export function RecordTypeBadge({ type }: { type: string }) {
  const v = visualForType(type)
  const Icon = v.Icon
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        height: 24,
        px: "8px",
        borderRadius: "7px",
        bgcolor: v.bg,
        color: v.fg,
        fontSize: 10.5,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Icon sx={{ fontSize: 14 }} />
      {v.label}
    </Box>
  )
}
