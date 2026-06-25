import React from "react"
import { Box, Button, Popover, Stack, TextField, Typography, useTheme } from "@mui/material"

export interface DueDatePopoverProps {
  anchorEl: HTMLElement | null
  // Explicit open state (shell-controlled). Optional: when omitted, open derives
  // from anchorEl — so anchorEl-driven call sites (the Tasks queue) work unchanged.
  open?: boolean
  onClose: () => void
  current: string | null
  // eslint-disable-next-line no-unused-vars
  onSelect: (dueDate: string | null) => void
  headerLabel?: string
}

// Shared due-date editor popover. Theme-aware (dark mode) via tokens + the native
// date input's colorScheme. Used both by the Tasks queue (inline edit / create) and
// by the shared RecordDetailShell date fields (staged into the batch-confirm model).
function DueDatePopoverImpl({ anchorEl, open, onClose, current, onSelect, headerLabel }: DueDatePopoverProps) {
  const theme = useTheme()
  const isOpen = open ?? Boolean(anchorEl)
  const [val, setVal] = React.useState(current ? current.slice(0, 10) : "")
  // Re-sync the field to the (possibly staged) committed value each time the popover
  // opens, so reopening a field that already has a pending edit shows that value.
  React.useEffect(() => {
    if (isOpen) setVal(current ? current.slice(0, 10) : "")
  }, [isOpen, current])

  return (
    <Popover
      open={isOpen}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{
        sx: {
          boxShadow: 3,
          borderRadius: 1,
          border: "0.5px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          p: "12px",
          minWidth: 200,
        },
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "text.secondary",
          mb: "8px",
        }}
      >
        {headerLabel ?? "Due date"}
      </Typography>
      <TextField
        type="date"
        size="small"
        fullWidth
        value={val}
        InputLabelProps={{ shrink: true }}
        inputProps={{ sx: { colorScheme: theme.palette.mode } }}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSelect(val || null)
            onClose()
          }
        }}
      />
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: "10px" }}>
        <Button
          size="small"
          variant="text"
          sx={{ fontSize: 12, color: "text.secondary" }}
          onClick={() => {
            onSelect(null)
            onClose()
          }}
        >
          Clear
        </Button>
        <Button
          size="small"
          variant="contained"
          sx={{ fontSize: 12 }}
          onClick={() => {
            onSelect(val || null)
            onClose()
          }}
        >
          Set
        </Button>
      </Stack>
    </Popover>
  )
}

export const DueDatePopover = React.memo(DueDatePopoverImpl)
