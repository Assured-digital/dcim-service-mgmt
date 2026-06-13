import React from "react"
import { Box, Button, Stack, Typography } from "@mui/material"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
import PersonIcon from "@mui/icons-material/Person"
import LinkIcon from "@mui/icons-material/Link"
import { Avatar } from "../shared"
import { CommentBody } from "./CommentBody"
import type { ResolvedMention } from "./CommentBody"
import { ActivityCommentBox, type CommentDraft } from "./activityCommentBox"
import { useReplyToComment } from "./useReplyToComment"

// ─────────────────────────────────────────────────────────────────────────────
// Activity feed item — the shared comment-item / event wrapper rendered by every
// detail page's activity timeline (RECORD_DETAIL_SPEC §6). Comment events show the
// author's initials-avatar + heavier name + muted timestamp header with the rich
// CommentBody grouped beneath; status / assignment / link events keep a type-icon.
//
// Threading (two-level): a top-level comment post (one carrying `commentId`) renders
// a quiet Reply affordance + an inline rich composer + its `replies` threaded beneath
// it (flat, oldest-first, lightly indented with a thread line). Replies reuse THIS
// component (`asReply`) so a reply renders identically to a post — minus the Reply
// button and any further nesting. Long threads collapse older replies behind a toggle.
// System events never thread; replies attach only to comment posts.
// ─────────────────────────────────────────────────────────────────────────────

export type FeedEventType = "status" | "comment" | "assignment" | "link"

// A reply is a rich comment nested under a post — same render fields as a comment
// FeedEvent's body, minus the feed-only / threading bits.
export type FeedReply = {
  id: string
  actor: string
  note?: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
  time: string
}

export type FeedEvent = {
  id: string
  type: FeedEventType
  actor: string
  text: React.ReactNode
  // Comment posts only: which kind of comment this is. WORK_NOTE is the internal
  // default (no indicator); CUSTOMER_UPDATE is customer-facing/consequential and
  // surfaces a small "Customer update" badge in the header. System events leave it
  // undefined. (The generic comment descriptor is dropped — see the header render.)
  commentKind?: "work_note" | "customer_update"
  note?: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
  time: string
  createdAt: string
  // ── Threading (top-level comment posts only) ──────────────────────────────
  // The raw comment id; its presence is what enables the Reply affordance + thread
  // (so legacy comments without it, and system events, never thread).
  commentId?: string
  // The record id this comment belongs to — scopes the reply refetch (see
  // useReplyToComment). Required alongside commentId to enable replying.
  entityId?: string
  replies?: FeedReply[]
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

// Older replies beyond this count are collapsed behind a "show N earlier" toggle.
const REPLY_COLLAPSE_THRESHOLD = 3

interface ActivityFeedItemProps {
  event: FeedEvent
  isLast: boolean
  // Render as a nested reply: no timeline connector, no Reply affordance, no further
  // nesting (two-level only), lighter avatar, no "added a work note" lead-in line.
  asReply?: boolean
}

export const ActivityFeedItem = React.memo(function ActivityFeedItem({
  event,
  isLast,
  asReply = false,
}: ActivityFeedItemProps) {
  const isComment = event.type === "comment"
  const visual = FEED_VISUALS[event.type]
  const Icon = visual.Icon

  const replyTo = useReplyToComment()
  const [savingReply, setSavingReply] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  // Only top-level comment posts that carry their raw id + record id can be replied to.
  const threadable = isComment && !asReply && !!event.commentId && !!event.entityId
  const replies = event.replies ?? []
  const collapsible = replies.length > REPLY_COLLAPSE_THRESHOLD
  const collapsed = collapsible && !expanded
  // Oldest-first within a thread; when collapsed we hide the OLDER ones (top) and keep
  // the most recent few visible.
  const visibleReplies = collapsed ? replies.slice(replies.length - REPLY_COLLAPSE_THRESHOLD) : replies
  const hiddenCount = replies.length - visibleReplies.length

  const handlePostReply = React.useCallback(
    async (draft: CommentDraft) => {
      if (!event.entityId || !event.commentId) return
      setSavingReply(true)
      try {
        await replyTo(event.entityId, event.commentId, draft)
      } finally {
        setSavingReply(false)
      }
    },
    [event.entityId, event.commentId, replyTo]
  )

  return (
    <Box
      sx={{ display: "flex", gap: 1.5, py: isComment ? 2 : 1, position: "relative" }}
    >
      {!isLast && !asReply ? (
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
        <Avatar name={event.actor} size={asReply ? "sm" : "md"} variant="neutral" />
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
          {/* Name anchors the post via WEIGHT at body size — not a larger size. */}
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary", lineHeight: 1.4 }}>
            {event.actor}
          </Typography>
          {/* Customer-update indicator — only the consequential, customer-facing kind
              gets a badge (work-notes are the internal default, unbadged). Caption-size
              tinted pill, so no new size token is introduced. */}
          {event.commentKind === "customer_update" ? (
            <Box
              component="span"
              sx={{
                fontSize: "0.75rem",
                fontWeight: 600,
                lineHeight: 1.4,
                px: 0.75,
                py: "1px",
                borderRadius: 1,
                bgcolor: "#e6f1fb",
                color: "#185fa5",
              }}
            >
              Customer update
            </Box>
          ) : null}
          {/* Timestamp recedes: caption size, muted secondary colour, regular weight. */}
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {event.time}
          </Typography>
        </Stack>
        {/* Descriptor — SYSTEM EVENTS ONLY ("changed status to X", "assigned to Y").
            Comment posts ARE the note, so the generic "added a work note" lead-in is
            redundant (Teams-style) and dropped; a customer-update shows the badge above
            instead. Suppressed centrally here regardless of what a page passes. */}
        {event.text && !isComment ? (
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.5, mt: 0.25 }}>
            {event.text}
          </Typography>
        ) : null}
        {event.note && event.note.trim().length > 0 ? (
          <Box
            sx={{
              // Neutral, enterprise treatment — a calm content block: thin neutral
              // border + faint neutral fill (divider / action tokens, NO colour accent).
              // Posts and replies share this; they stay distinguishable via the thread
              // indent + smaller reply avatar, not colour. Generous padding + the mt
              // gap below give the header→body breathing room (Teams-like spacing).
              border: "1px solid",
              borderColor: "divider",
              px: 1.25,
              py: 1,
              bgcolor: "action.hover",
              borderRadius: 1,
              mt: 1,
              fontSize: "0.875rem",
            }}
          >
            <CommentBody note={event.note} bodyJson={event.bodyJson} mentions={event.mentions} />
          </Box>
        ) : null}

        {threadable ? (
          <>
            {replies.length > 0 ? (
              <Box sx={{ mt: 0.5, pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
                {collapsed ? (
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => setExpanded(true)}
                    sx={{ px: 0.5, minWidth: 0, fontSize: 11, color: "text.secondary" }}
                  >
                    Show {hiddenCount} earlier {hiddenCount === 1 ? "reply" : "replies"}
                  </Button>
                ) : collapsible ? (
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => setExpanded(false)}
                    sx={{ px: 0.5, minWidth: 0, fontSize: 11, color: "text.secondary" }}
                  >
                    Show fewer
                  </Button>
                ) : null}
                {visibleReplies.map((r, idx) => (
                  <ActivityFeedItem
                    key={r.id}
                    asReply
                    isLast={idx === visibleReplies.length - 1}
                    event={{
                      id: r.id,
                      type: "comment",
                      actor: r.actor,
                      text: null,
                      note: r.note,
                      bodyJson: r.bodyJson,
                      mentions: r.mentions,
                      time: r.time,
                      createdAt: "",
                    }}
                  />
                ))}
              </Box>
            ) : null}

            {/* Slim per-thread reply field — channel-style, at the bottom of the thread
                (after any replies). Quiet pretext until clicked; one box per thread. */}
            <Box sx={{ pl: 1.5 }}>
              <ReplyField saving={savingReply} onPost={handlePostReply} />
            </Box>
          </>
        ) : null}
      </Box>
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// ReplyField — slim, quiet per-thread reply affordance (one per top-level post).
//
// Collapsed: a single-line, low-footprint "Reply…" pretext that reads as muted
// placeholder. Clicking (or tabbing) into it expands to the SAME rich composer
// used everywhere (ActivityCommentBox) — autofocused, with the shared focus-within
// highlight and the Post-on-dirty bar (Post shows only once there's content).
//
// Collapse rules mirror the EditableField blur affordance: losing focus while
// EMPTY returns to the pretext (no orphaned open box); unsaved content keeps it
// open. A successful post collapses it back to the pretext (toast fires upstream).
// ─────────────────────────────────────────────────────────────────────────────
function ReplyField({
  saving,
  onPost,
}: {
  saving: boolean
  onPost: (draft: CommentDraft) => Promise<void> | void
}) {
  const [open, setOpen] = React.useState(false)

  const handlePost = React.useCallback(
    async (draft: CommentDraft) => {
      await onPost(draft)
      setOpen(false)
    },
    [onPost]
  )

  if (!open) {
    return (
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        sx={{
          mt: 0.75,
          px: 1.5,
          py: 0.75,
          fontSize: "0.8125rem",
          color: "text.disabled",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          cursor: "text",
          userSelect: "none",
          transition: "border-color 120ms ease, background-color 120ms ease",
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": { outline: "none", borderColor: "primary.main" },
        }}
      >
        Reply…
      </Box>
    )
  }

  return (
    <Box sx={{ mt: 0.75 }}>
      <ActivityCommentBox
        saving={saving}
        onPost={handlePost}
        placeholder="Reply…"
        submitLabel="Reply"
        autoFocus
        hideActionsWhenEmpty
        onBlurEmpty={() => setOpen(false)}
      />
    </Box>
  )
}
