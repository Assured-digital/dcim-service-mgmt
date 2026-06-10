import React from "react"
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material"
import FileDownloadIcon from "@mui/icons-material/FileDownload"
import {
  type AttachmentSummary,
  downloadAttachment,
  fetchAttachmentBlob,
  formatFileSize,
  isImageType,
  isPdf,
} from "../lib/attachments"

interface AttachmentPreviewModalProps {
  open: boolean
  attachment: AttachmentSummary | null
  onClose: () => void
}

// Previews a single attachment in-app. The bytes are fetched through the
// authenticated api client (NOT a raw src) and rendered from an object URL, which is
// always revoked on close / unmount / attachment change so there's no leak.
export function AttachmentPreviewModal({ open, attachment, onClose }: AttachmentPreviewModalProps) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // The validated contentType decides how we render. `inline` is the server's
  // safe-to-render gate; anything not inline-previewable falls back to download.
  const previewable = !!attachment && attachment.inline && (isPdf(attachment.contentType) || isImageType(attachment.contentType))

  React.useEffect(() => {
    if (!open || !attachment || !previewable) {
      return
    }
    let revoked = false
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)
    setUrl(null)
    fetchAttachmentBlob(attachment.id)
      .then((blob) => {
        if (revoked) return
        objectUrl = window.URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!revoked) setError("Could not load preview.")
      })
      .finally(() => {
        if (!revoked) setLoading(false)
      })
    return () => {
      revoked = true
      if (objectUrl) window.URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [open, attachment, previewable])

  const body = () => {
    if (!attachment) return null
    if (!previewable) {
      return (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 14, mb: 0.5 }}>{attachment.filename}</Typography>
          <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)", display: "block", mb: 2 }}>
            {formatFileSize(attachment.size)} · {attachment.contentType}
          </Typography>
          <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)" }}>
            This file type can't be previewed. Download it to view.
          </Typography>
        </Box>
      )
    }
    if (loading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
          <CircularProgress size={28} />
        </Box>
      )
    }
    if (error) {
      return (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        </Box>
      )
    }
    if (url && isPdf(attachment.contentType)) {
      return (
        <Box
          component="iframe"
          src={url}
          title={attachment.filename}
          sx={{ width: "100%", height: "75vh", border: "none" }}
        />
      )
    }
    if (url) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40vh" }}>
          <Box
            component="img"
            src={url}
            alt={attachment.filename}
            sx={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain" }}
          />
        </Box>
      )
    }
    return null
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ fontSize: 15, pr: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {attachment?.filename ?? "Attachment"}
      </DialogTitle>
      <DialogContent dividers>{body()}</DialogContent>
      <DialogActions>
        {attachment ? (
          <Button
            size="small"
            startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
            onClick={() => downloadAttachment(attachment)}
            sx={{ textTransform: "none" }}
          >
            Download
          </Button>
        ) : null}
        <Button size="small" onClick={onClose} sx={{ textTransform: "none" }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
