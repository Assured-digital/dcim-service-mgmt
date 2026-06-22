import React from "react"
import {
  Box, Button, CircularProgress, Dialog, Stack, TextField, Typography,
  useMediaQuery, useTheme,
} from "@mui/material"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import { type AttachmentSummary, fetchAttachmentBlob } from "../../lib/attachments"

// The image-detail beat: tapping any evidence thumbnail (staged draft, queued-pending, or
// uploaded) opens it HERE for a closer look, caption edit, and a deliberate — confirmed —
// delete. This replaces the old hair-trigger inline × + inline caption on the thumbnail grid:
// destroying evidence is now a two-step action inside the opened image, never a stray tap.
//
// Three photo sources share one view:
//  - staged   — added to the evidence composer but NOT yet Saved (local object URL); caption
//               lives in the draft, delete just drops it from the draft.
//  - pending  — Saved while offline, queued but not yet uploaded (local object URL); caption
//               rides the queued upload; delete is unavailable until it uploads.
//  - uploaded — a persisted attachment; bytes are fetched through the authed api client (never
//               a raw src), caption edit + delete hit the server (offline-safe via the queue).
export type PhotoDetailTarget =
  | { source: "staged"; key: string; url: string; filename: string; caption: string }
  | { source: "pending"; seq: number; url: string; filename: string; caption: string }
  | { source: "uploaded"; attachment: AttachmentSummary }

function targetCaption(t: PhotoDetailTarget): string {
  return t.source === "uploaded" ? (t.attachment.caption ?? "") : t.caption
}
function targetFilename(t: PhotoDetailTarget): string {
  return t.source === "uploaded" ? t.attachment.filename : t.filename
}

export function PhotoDetailDialog({
  open,
  target,
  canEdit,
  onClose,
  onCaptionCommit,
  onDelete,
}: {
  open: boolean
  target: PhotoDetailTarget | null
  canEdit: boolean
  onClose: () => void
  // eslint-disable-next-line no-unused-vars
  onCaptionCommit: (target: PhotoDetailTarget, caption: string) => void
  // eslint-disable-next-line no-unused-vars
  onDelete: (target: PhotoDetailTarget) => void
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"))
  const [caption, setCaption] = React.useState("")
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  // Uploaded bytes are fetched through the authed client; staged/pending already have a local
  // object URL we can render directly (and must NOT revoke — those are owned elsewhere).
  const [fetchedUrl, setFetchedUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  // Seed the caption editor + reset transient state whenever the opened photo changes.
  React.useEffect(() => {
    if (target) setCaption(targetCaption(target))
    setConfirmingDelete(false)
  }, [target])

  const directUrl = target && target.source !== "uploaded" ? target.url : null
  const uploadedId = target && target.source === "uploaded" ? target.attachment.id : null

  React.useEffect(() => {
    if (!open || !uploadedId) { setFetchedUrl(null); return }
    let revoked = false
    let objectUrl: string | null = null
    setLoading(true); setError(false); setFetchedUrl(null)
    fetchAttachmentBlob(uploadedId)
      .then(blob => { if (revoked) return; objectUrl = URL.createObjectURL(blob); setFetchedUrl(objectUrl) })
      .catch(() => { if (!revoked) setError(true) })
      .finally(() => { if (!revoked) setLoading(false) })
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); setFetchedUrl(null) }
  }, [open, uploadedId])

  if (!target) return null
  const url = directUrl ?? fetchedUrl
  const canDelete = canEdit && target.source !== "pending"

  // Commit the caption (only if the user changed it) on the way out, then close. Staged →
  // updates the draft; pending/uploaded → the parent persists through the offline queue.
  function commitAndClose() {
    if (target && canEdit) {
      const next = caption.trim()
      if (next !== targetCaption(target).trim()) onCaptionCommit(target, next)
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={commitAndClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : "14px" } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: fullScreen ? "100%" : "auto" }}>
        {/* Header */}
        <Box sx={{ px: "20px", pt: "18px", pb: "12px" }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Photo evidence</Typography>
          <Typography sx={{ fontSize: 12, color: "#94a3b8", mt: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {targetFilename(target)}
          </Typography>
        </Box>

        {/* Image */}
        <Box
          sx={{
            mx: "20px", borderRadius: "10px", overflow: "hidden", bgcolor: "#0f172a",
            display: "flex", alignItems: "center", justifyContent: "center",
            flex: fullScreen ? 1 : "0 0 auto",
            minHeight: 200, maxHeight: fullScreen ? "none" : 400,
          }}
        >
          {loading ? (
            <CircularProgress size={26} sx={{ color: "#94a3b8" }} />
          ) : error ? (
            <Typography sx={{ fontSize: 13, color: "#cbd5e1", py: 4 }}>Couldn't load this photo.</Typography>
          ) : url ? (
            <Box
              component="img"
              src={url}
              alt={targetFilename(target)}
              sx={{ width: "100%", height: "100%", maxHeight: fullScreen ? "60vh" : 400, objectFit: "contain", display: "block" }}
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
            placeholder="Caption…"
            value={caption}
            disabled={!canEdit}
            onChange={(e) => setCaption(e.target.value)}
            inputProps={{ maxLength: 280 }}
            sx={{ "& .MuiInputBase-root": { fontSize: { xs: 16, md: 14 } } }}
          />
          <Typography sx={{ fontSize: 12, color: "#94a3b8", mt: "6px" }}>Captions appear in the report.</Typography>
        </Box>

        {/* Delete confirm (deliberate, two-step) */}
        {confirmingDelete ? (
          <Box sx={{ mx: "20px", mt: "16px", p: "12px 14px", bgcolor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px" }}>
            <Typography sx={{ fontSize: 13, color: "#991b1b", mb: "10px" }}>
              This removes the photo and its caption from this item. This can't be undone.
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={() => setConfirmingDelete(false)} sx={{ fontSize: 13, color: "#64748b" }}>Cancel</Button>
              <Button size="small" variant="contained" color="error" disableElevation
                onClick={() => { onDelete(target); onClose() }} sx={{ fontSize: 13 }}>
                Delete photo
              </Button>
            </Stack>
          </Box>
        ) : null}

        {/* Actions */}
        <Stack direction="row" spacing={1} sx={{ px: "20px", py: "18px", mt: fullScreen ? 0 : "4px", alignItems: "center" }}>
          {canDelete ? (
            <Button
              onClick={() => setConfirmingDelete(true)}
              disabled={confirmingDelete}
              startIcon={<DeleteOutlineIcon sx={{ fontSize: 18 }} />}
              sx={{ fontSize: 13, color: "#dc2626" }}
            >
              Delete
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" disableElevation onClick={commitAndClose} sx={{ fontSize: 13, py: "8px", px: "16px" }}>
            Close
          </Button>
        </Stack>
      </Box>
    </Dialog>
  )
}
