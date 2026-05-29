import React from "react"
import { Box, ClickAwayListener, Paper, Popper, Typography } from "@mui/material"

export interface PopoverOption {
  value: string
  label: string
  iconBg: string
  icon: React.ReactNode
  iconColor: string
}

export interface StatusPopoverProps {
  id: string
  header: string
  options: PopoverOption[]
  currentValue: string
  onSelect: (value: string) => void
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
}

function StatusPopoverImpl({
  id,
  header,
  options,
  currentValue,
  onSelect,
  anchorEl,
  open,
  onClose,
}: StatusPopoverProps) {
  React.useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  const handleSelect = React.useCallback(
    (value: string) => () => {
      onSelect(value)
      onClose()
    },
    [onSelect, onClose]
  )

  const handleClickAway = React.useCallback(() => {
    onClose()
  }, [onClose])

  const popperModifiers = React.useMemo(
    () => [
      { name: "flip", options: { fallbackPlacements: ["bottom-end"] } },
      { name: "offset", options: { offset: [0, 4] } },
    ],
    []
  )

  return (
    <Popper
      id={id}
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      modifiers={popperModifiers}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
    >
      <ClickAwayListener onClickAway={handleClickAway}>
        <Paper
          elevation={3}
          sx={{
            border: "0.5px solid",
            borderColor: "divider",
            borderRadius: "10px",
            padding: "6px",
            minWidth: 220,
          }}
        >
          <Typography
            sx={{
              fontSize: 11,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 500,
              px: 1,
              py: 0.5,
            }}
          >
            {header}
          </Typography>
          <Box>
            {options.map((opt) => {
              const selected = opt.value === currentValue
              return (
                <Box
                  key={opt.value}
                  onClick={handleSelect(opt.value)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1,
                    py: 0.625,
                    borderRadius: 1,
                    cursor: "pointer",
                    bgcolor: selected ? "action.hover" : "transparent",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: "5px",
                      bgcolor: opt.iconBg,
                      color: opt.iconColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {opt.icon}
                  </Box>
                  <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                    {opt.label}
                  </Typography>
                  {selected ? (
                    <Typography
                      sx={{ color: "primary.main", fontSize: 14, fontWeight: 600, ml: 0.5 }}
                    >
                      ✓
                    </Typography>
                  ) : null}
                </Box>
              )
            })}
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  )
}

export const StatusPopover = React.memo(StatusPopoverImpl)
