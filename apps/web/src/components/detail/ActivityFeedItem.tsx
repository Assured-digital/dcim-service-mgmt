import React from "react"
import { Box, Stack, Typography } from "@mui/material"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
import PersonIcon from "@mui/icons-material/Person"
import LinkIcon from "@mui/icons-material/Link"
import { Avatar } from "../shared"
import { CommentBody } from "./CommentBody"
import type { ResolvedMention } from "./CommentBody"

// ─────────────────────────────────────────────────────────────────────────────
// Activity feed item — the shared comment-item / event wrapper rendered by every
// detail page's activity timeline (RECORD_DETAIL_SPEC §6). Comment events show the
// author's initials-avatar + heavier name + muted timestamp header with the rich
// CommentBody grouped beneath; status / assignment / link events keep a type-icon.
// ─────────────────────────────────────────────────────────────────────────────

export type FeedEventType = "status" | "comment" | "assignment" | "link"

export type FeedEvent = {
  id: string
  type: FeedEventType
  actor: string
  text: React.ReactNode
  note?: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
  time: string
  createdAt: string
}

interface FeedVisual {
  Icon: React.ComponentType<{ sx?: object }>
  bg: string
  fg: string
}

const FEED_VISUALS: Record<FeedEventType, FeedVisual> = {
  status: { Icon: PlayArrowIcon, bg: "#e6f1fb", fg: "#185fa5" },
  comment: { Icon: ChatBubbleOutlineIcon, bg: "#eaf3de", fg: "#3b6d11" },
  assignment: { Icon: PersonIcon, bg: "#faeeda", fg: "#854f0b" },
  link: { Icon: LinkIcon, bg: "#fbeaf0", fg: "#993556" },
}

interface ActivityFeedItemProps {
  event: FeedEvent
  isLast: boolean
}

export const ActivityFeedItem = React.memo(function ActivityFeedItem({
  event,
  isLast,
}: ActivityFeedItemProps) {
  const isComment = event.type === "comment"
  const visual = FEED_VISUALS[event.type]
  const Icon = visual.Icon

  return (
    <Box
      sx={{ display: "flex", gap: 1.5, py: isComment ? 1.5 : 1, position: "relative" }}
    >
      {!isLast ? (
        <Box
          sx={{
            position: "absolute",
            left: 12,
            top: 28,
            bottom: -8,
            width: "1px",
            bgcolor: "divider",
          }}
        />
      ) : null}
      {isComment ? (
        <Avatar name={event.actor} size="md" variant="neutral" />
      ) : (
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            bgcolor: visual.bg,
            color: visual.fg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            zIndex: 1,
          }}
        >
          <Icon sx={{ fontSize: 14 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
            {event.actor}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {event.time}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.5 }}>
          {event.text}
        </Typography>
        {event.note && event.note.trim().length > 0 ? (
          <Box
            sx={{
              borderLeft: "2px solid",
              borderColor: "success.light",
              pl: 1,
              py: 0.5,
              bgcolor: "action.hover",
              borderRadius: "0 4px 4px 0",
              mt: 0.5,
              fontSize: 12,
            }}
          >
            <CommentBody note={event.note} bodyJson={event.bodyJson} mentions={event.mentions} />
          </Box>
        ) : null}
      </Box>
    </Box>
  )
})
