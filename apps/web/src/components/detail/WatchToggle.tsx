import React from "react"
import { Button, CircularProgress, Tooltip } from "@mui/material"
import VisibilityIcon from "@mui/icons-material/Visibility"
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchWatchStatus, setWatch, type WatchRecordType } from "../../lib/watch"
import { useNotification } from "../NotificationProvider"

// Jira-style Watch toggle for a record detail page. A single on/off control: watching
// opts you into this record's activity notifications (status changes + new comments)
// even when you're not assigned. WHICH events and channels you actually receive is
// governed globally by personal notification settings — this only sets membership.
export interface WatchToggleProps {
  recordType: WatchRecordType
  recordId: string
}

function WatchToggleImpl({ recordType, recordId }: WatchToggleProps) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const key = React.useMemo(() => ["watch", recordType, recordId] as const, [recordType, recordId])

  const { data: watching, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchWatchStatus(recordType, recordId),
    enabled: !!recordId,
  })

  const mutation = useMutation({
    mutationFn: (next: boolean) => setWatch(recordType, recordId, next),
    onSuccess: (result) => {
      qc.setQueryData(key, result)
      notify.success(result ? "Watching — you'll be notified of updates" : "Stopped watching")
    },
    onError: () => notify.error("Couldn't update watch"),
  })

  const isWatching = !!watching
  const busy = mutation.isPending

  return (
    <Tooltip
      title={
        isWatching
          ? "You're receiving updates for this record"
          : "Get notified of updates to this record"
      }
    >
      <span>
        <Button
          size="small"
          onClick={() => mutation.mutate(!isWatching)}
          disabled={isLoading || busy}
          startIcon={
            busy ? (
              <CircularProgress size={12} color="inherit" />
            ) : isWatching ? (
              <VisibilityIcon sx={{ fontSize: 15 }} />
            ) : (
              <VisibilityOutlinedIcon sx={{ fontSize: 15 }} />
            )
          }
          sx={{
            textTransform: "none",
            fontSize: 12,
            fontWeight: 500,
            px: 1,
            py: 0.375,
            minWidth: 0,
            color: isWatching ? "primary.main" : "text.secondary",
            bgcolor: isWatching ? "action.selected" : "transparent",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          {isWatching ? "Watching" : "Watch"}
        </Button>
      </span>
    </Tooltip>
  )
}

export const WatchToggle = React.memo(WatchToggleImpl)
