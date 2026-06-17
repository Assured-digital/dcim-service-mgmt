import React from "react"
import {
  Box, Button, Dialog, Stack, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material"
import CheckIcon from "@mui/icons-material/Check"
import ReplayIcon from "@mui/icons-material/Replay"

// Photo capture confirm beat (Stage 3 of the engineer check journey). A captured/selected
// image is previewed HERE before anything is committed — the engineer adds an optional
// caption and explicitly Attaches, or Retakes / Discards. Nothing is enqueued until "Attach
// photo" (the parent calls the existing offline queue then). This is pure UI on top of the
// proven P4a path, so it works fully offline: the preview is a local object URL the parent
// owns (created on select, revoked on attach/discard).
//
// fullScreen on phones (one-handed capture review); a centred card on desktop.
export function PhotoCaptureDialog({
  open,
  url,
  caption,
  onCaptionChange,
  onRetake,
  onDiscard,
  onAttach,
  attaching = false,
  recommended = false,
}: {
  open: boolean
  url: string | null
  caption: string
  onCaptionChange: (value: string) => void
  onRetake: () => void
  onDiscard: () => void
  onAttach: () => void
  attaching?: boolean
  recommended?: boolean
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"))

  return (
    <Dialog
      open={open}
      onClose={onDiscard}
      fullScreen={fullScreen}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : "14px" } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: fullScreen ? "100%" : "auto" }}>
        {/* Header */}
        <Box sx={{ px: "20px", pt: "18px", pb: "12px" }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Add photo evidence</Typography>
        </Box>

        {/* Image preview */}
        <Box
          sx={{
            mx: "20px", borderRadius: "10px", overflow: "hidden", bgcolor: "#0f172a",
            display: "flex", alignItems: "center", justifyContent: "center",
            flex: fullScreen ? 1 : "0 0 auto",
            minHeight: 180, maxHeight: fullScreen ? "none" : 360,
          }}
        >
          {url ? (
            <Box
              component="img"
              src={url}
              alt="Captured evidence preview"
              sx={{ width: "100%", height: "100%", maxHeight: fullScreen ? "60vh" : 360, objectFit: "contain", display: "block" }}
            />
          ) : null}
        </Box>

        {/* Caption */}
        <Box sx={{ px: "20px", pt: "16px" }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            autoFocus={!fullScreen}
            placeholder="Caption…"
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            inputProps={{ maxLength: 280 }}
            sx={{ "& .MuiInputBase-root": { fontSize: { xs: 16, md: 14 } } }}
          />
          <Typography sx={{ fontSize: 12, color: recommended ? "#b45309" : "#94a3b8", mt: "6px" }}>
            {recommended
              ? "Recommended for failures — the caption appears in the report."
              : "Optional — captions appear in the report."}
          </Typography>
        </Box>

        {/* Actions */}
        <Stack direction="row" spacing={1} sx={{ px: "20px", py: "18px", mt: fullScreen ? 0 : "4px", alignItems: "center" }}>
          <Button
            onClick={onDiscard}
            disabled={attaching}
            sx={{ fontSize: 13, color: "#64748b" }}
          >
            Discard
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={onRetake}
            disabled={attaching}
            startIcon={<ReplayIcon sx={{ fontSize: 16 }} />}
            sx={{ fontSize: 13, color: "#475569" }}
          >
            Retake
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={onAttach}
            disabled={attaching || !url}
            startIcon={<CheckIcon sx={{ fontSize: 16 }} />}
            sx={{ fontSize: 13, py: "8px", px: "16px" }}
          >
            {attaching ? "Attaching…" : "Attach photo"}
          </Button>
        </Stack>
      </Box>
    </Dialog>
  )
}
