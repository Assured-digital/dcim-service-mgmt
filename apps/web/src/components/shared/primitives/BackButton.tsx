import { Button } from "@mui/material"
import type { SxProps, Theme } from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"

interface BackButtonProps {
  label: string
  onClick: () => void
  sx?: SxProps<Theme>
}

// Shared "back to list" affordance — ONE treatment across every surface (checks
// landing/history/detail, …): a flush text button (no negative-margin overhang) so it
// always aligns to the page gutter. Use for page-level back navigation only, not for
// in-page mode toggles. Pass sx for surrounding spacing (e.g. mb) — it merges over the base.
export function BackButton({ label, onClick, sx }: BackButtonProps) {
  return (
    <Button
      onClick={onClick}
      startIcon={<ArrowBackIcon sx={{ fontSize: 15 }} />}
      size="small"
      sx={[
        {
          color: "#64748b", fontSize: 12.5, textTransform: "none",
          "&:hover": { color: "#1d4ed8", bgcolor: "transparent" },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {label}
    </Button>
  )
}
