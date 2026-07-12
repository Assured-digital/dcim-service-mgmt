import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Box, Button, Divider, IconButton, Tooltip, Typography } from "@mui/material"
import LinkIcon from "@mui/icons-material/Link"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import LinkOffIcon from "@mui/icons-material/LinkOff"
import { AttachmentsContent, type AttachmentsHandle } from "./AttachmentsContent"
import { SharePointPickerModal } from "./SharePointPickerModal"
import { useNotification } from "./NotificationProvider"
import type { AttachmentRecordType, AttachmentSummary } from "../lib/attachments"
import { listRecordDocuments, linkDocument, unlinkDocument, type DriveItem } from "../lib/documents"

interface Props {
  attachments: AttachmentSummary[]
  recordType: AttachmentRecordType
  recordId: string
  onChanged: () => void
  showAddButton?: boolean
  readOnly?: boolean
}

// Unified per-record "Documents" panel: the app's own uploaded files
// (AttachmentsContent, bytes streamed through the API) PLUS linked SharePoint
// business documents (DocumentReference, opened in SharePoint). Forwards the
// AttachmentsContent openPicker handle so the section-header "+" still uploads.
export const DocumentsPanel = React.forwardRef<AttachmentsHandle, Props>(function DocumentsPanel(
  { attachments, recordType, recordId, onChanged, showAddButton, readOnly = false },
  ref
) {
  const { notify } = useNotification()
  const qc = useQueryClient()
  const innerRef = React.useRef<AttachmentsHandle>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  React.useImperativeHandle(ref, () => ({ openPicker: () => innerRef.current?.openPicker() }), [])

  const docsKey = ["record-documents", recordType, recordId]
  const { data: docs = [] } = useQuery({
    queryKey: docsKey,
    queryFn: () => listRecordDocuments(recordType, recordId),
    enabled: !!recordId
  })

  const linkMutation = useMutation({
    mutationFn: (item: DriveItem) =>
      linkDocument({ title: item.name, url: item.webUrl, linkedEntityType: recordType, linkedEntityId: recordId }),
    onSuccess: () => { notify.success("Document linked"); qc.invalidateQueries({ queryKey: docsKey }) },
    onError: () => notify.error("Couldn't link document")
  })

  const unlinkMutation = useMutation({
    mutationFn: (id: string) => unlinkDocument(id),
    onSuccess: () => { notify.success("Document unlinked"); qc.invalidateQueries({ queryKey: docsKey }) },
    onError: () => notify.error("Couldn't unlink document")
  })

  return (
    <Box>
      <AttachmentsContent
        ref={innerRef}
        attachments={attachments}
        recordType={recordType}
        recordId={recordId}
        onChanged={onChanged}
        showAddButton={showAddButton}
        readOnly={readOnly}
      />

      {docs.length > 0 ? <Divider sx={{ my: 1 }} /> : null}

      {docs.map((d) => (
        <Box
          key={d.id}
          sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.625, borderRadius: 1, "&:hover .doc-action": { opacity: 1 } }}
        >
          <Box sx={{ width: 26, height: 26, borderRadius: 1, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <LinkIcon sx={{ fontSize: 14, color: "text.secondary" }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "text.primary" }}>
              {d.title}
            </Typography>
            <Typography sx={{ fontSize: 10, color: "text.tertiary" }}>SharePoint document</Typography>
          </Box>
          <Tooltip title="Open in SharePoint">
            <IconButton
              className="doc-action"
              size="small"
              component="a"
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0, p: 0.25 }}
            >
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {!readOnly ? (
            <Tooltip title="Unlink">
              <IconButton
                className="doc-action"
                size="small"
                onClick={() => unlinkMutation.mutate(d.id)}
                sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0, p: 0.25 }}
              >
                <LinkOffIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      ))}

      {!readOnly ? (
        <Button
          variant="text"
          size="small"
          startIcon={<LinkIcon sx={{ fontSize: 14 }} />}
          onClick={() => setPickerOpen(true)}
          sx={{ textTransform: "none", mt: 0.25 }}
        >
          Link document
        </Button>
      ) : null}

      <SharePointPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => { linkMutation.mutate(item); setPickerOpen(false) }}
      />
    </Box>
  )
})
