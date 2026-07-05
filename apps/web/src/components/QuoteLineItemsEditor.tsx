import React from "react"
import { Box, Button, IconButton, TextField, Typography } from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import { formatMoney, type QuoteLineInput } from "../lib/crm"

// Editable quote line items (CRM_DESIGN.md §4): free-text lines, qty × unit
// price, derived total. No product catalogue by design (CPQ skipped).
export function QuoteLineItemsEditor({ lines, onChange }: {
  lines: QuoteLineInput[]
  onChange: (next: QuoteLineInput[]) => void
}) {
  const set = (idx: number, patch: Partial<QuoteLineInput>) =>
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const total = lines.reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0), 0)

  return (
    <Box>
      {lines.map((l, idx) => (
        <Box key={idx} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "flex-start" }}>
          <TextField size="small" placeholder="Description" value={l.description}
            onChange={e => set(idx, { description: e.target.value })} sx={{ flex: 1 }} />
          <TextField size="small" type="number" placeholder="Qty" value={l.quantity}
            onChange={e => set(idx, { quantity: Number(e.target.value) })} sx={{ width: 80 }} />
          <TextField size="small" type="number" placeholder="Unit £" value={l.unitPrice}
            onChange={e => set(idx, { unitPrice: Number(e.target.value) })} sx={{ width: 110 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, width: 90, textAlign: "right", pt: "9px" }}>
            {formatMoney((l.quantity || 0) * (l.unitPrice || 0)) ?? "£0"}
          </Typography>
          <IconButton size="small" onClick={() => onChange(lines.filter((_x, i) => i !== idx))}>
            <DeleteOutlineIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Box>
      ))}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 15 }} />}
          onClick={() => onChange([...lines, { description: "", quantity: 1, unitPrice: 0 }])}>
          Add line
        </Button>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
          Total {formatMoney(total) ?? "£0"}
        </Typography>
      </Box>
    </Box>
  )
}
