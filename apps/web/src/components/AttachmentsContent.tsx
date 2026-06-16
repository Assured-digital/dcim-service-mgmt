import React from "react"
import { useMutation } from "@tanstack/react-query"
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import ImageIcon from "@mui/icons-material/Image"
import DescriptionIcon from "@mui/icons-material/Description"
import FileDownloadIcon from "@mui/icons-material/FileDownload"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import { useNotification } from "./NotificationProvider"
import { AttachmentPreviewModal } from "./AttachmentPreviewModal"
import {
  type AttachmentRecordType,
  type AttachmentSummary,
  attachmentErrorMessage,
  deleteAttachment,
  downloadAttachment,
  formatFileSize,
  isImageType,
  uploadAttachment,
} from "../lib/attachments"

interface AttachmentsContentProps {
  attachments: AttachmentSummary[]
  recordType: AttachmentRecordType
  recordId: string
  // Invalidate the page's detail query so a new/removed row reflects without reload.
  onChanged: () => void
  // Inline "Attach file" button below the list. Shell pages hoist the add action
  // to the section header "+" (via the imperative openPicker handle below), so they
  // pass false; non-shell consumers (e.g. CheckDetailPage) keep the default.
  showAddButton?: boolean
  // Frozen evidence: hide every mutate affordance (Attach file + per-row Delete),
  // leaving view/download/preview. Used by CheckDetailPage for COMPLETED/CLOSED checks,
  // mirroring the backend attachment lock so the UI never offers an action the API rejects.
  readOnly?: boolean
}

// Imperative handle so a host (the section-header "+") can trigger the file picker
// while the hidden <input> + upload mutation stay encapsulated here.
export interface AttachmentsHandle {
  openPicker: () => void
}

// File-picker accept list — mirrors the backend allow-list (PDF + raster images).
// The backend still validates by magic bytes, so this is only a UX hint.
const ACCEPT = ".pdf,image/png,image/jpeg,image/gif,image/webp"

// Shared attachments panel for the six work-item detail pages. Mirrors
// LinkedRecordsContent: presentational list + an always-visible add control, owning
// its own upload/delete mutations and the in-app preview modal.
export const AttachmentsContent = React.memo(
  React.forwardRef<AttachmentsHandle, AttachmentsContentProps>(function AttachmentsContent(
    { attachments, recordType, recordId, onChanged, showAddButton = true, readOnly = false },
    ref
  ) {
  const { notify } = useNotification()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [preview, setPreview] = React.useState<AttachmentSummary | null>(null)

  React.useImperativeHandle(ref, () => ({ openPicker: () => inputRef.current?.click() }), [])

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(recordType, recordId, file),
    onSuccess: () => {
      notify.success("Attachment uploaded")
      onChanged()
    },
    onError: (err) => notify.error(attachmentErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      notify.success("Attachment deleted")
      onChanged()
    },
    onError: (err) => notify.error(attachmentErrorMessage(err)),
  })

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input value so picking the same file again still fires onChange.
    e.target.value = ""
    if (file) uploadMutation.mutate(file)
  }

  const handleDelete = (att: AttachmentSummary) => {
    if (window.confirm(`Delete "${att.filename}"?`)) deleteMutation.mutate(att.id)
  }

  return (
    <Box>
      {attachments.length === 0 ? (
        <Typography variant="caption" sx={{ color: "text.tertiary", display: "block", py: 0.5 }}>
          No attachments
        </Typography>
      ) : (
        attachments.map((att) => {
          const Icon = isImageType(att.contentType) ? ImageIcon : DescriptionIcon
          return (
            <Box
              key={att.id}
              onClick={() => setPreview(att)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 0.625,
                borderRadius: 1,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                "&:hover .at-action": { opacity: 1 },
              }}
            >
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon sx={{ fontSize: 14, color: "text.secondary" }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 12,
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "text.primary",
                  }}
                >
                  {att.filename}
                </Typography>
                <Typography sx={{ fontSize: 10, color: "text.tertiary" }}>
                  {formatFileSize(att.size)} · {new Date(att.uploadedAt).toLocaleDateString("en-GB")}
                </Typography>
              </Box>
              <Tooltip title="Download">
                <IconButton
                  className="at-action"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    downloadAttachment(att).catch((err) => notify.error(attachmentErrorMessage(err)))
                  }}
                  sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0, p: 0.25 }}
                >
                  <FileDownloadIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              {!readOnly ? (
                <Tooltip title="Delete">
                  <IconButton
                    className="at-action"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(att)
                    }}
                    sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0, p: 0.25 }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Box>
          )
        })
      )}

      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={handlePick} />
      {showAddButton && !readOnly ? (
        <Button
          variant="text"
          size="small"
          disabled={uploadMutation.isPending}
          startIcon={
            uploadMutation.isPending ? <CircularProgress size={14} /> : <AddIcon sx={{ fontSize: 14 }} />
          }
          onClick={() => inputRef.current?.click()}
          sx={{ textTransform: "none", mt: 0.25 }}
        >
          {uploadMutation.isPending ? "Uploading…" : "Attach file"}
        </Button>
      ) : uploadMutation.isPending ? (
        // Inline add button is hidden (the header "+" hosts it), so surface upload
        // progress here instead.
        <Typography
          variant="caption"
          sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary", mt: 0.5 }}
        >
          <CircularProgress size={12} /> Uploading…
        </Typography>
      ) : null}

      <AttachmentPreviewModal open={!!preview} attachment={preview} onClose={() => setPreview(null)} />
    </Box>
  )
  })
)
