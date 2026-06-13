import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { useNotification } from "../NotificationProvider"
import type { CommentDraft } from "./activityCommentBox"

// Shared reply-posting handler. Replying to a comment is uniform across every surface
// (detail pages + the Task drawer): POST /comments/reply, refetch the record's threaded
// comments, toast. So it lives here once rather than being re-implemented per page —
// unlike top-level note posting, replies have no page-specific behaviour.
//
// entityType/entityId/type are inherited server-side from the parent post (see the
// Stage-2 CreateReplyDto), so the body carries only parentCommentId + the rich content.
//
// Cache refresh is by PREDICATE keyed on the record id: every comment query is keyed
// ["work-notes-<type>", id] or ["customer-updates-<type>", id] (the only two prefixes
// in use — verified across all detail pages + the drawer), so matching on prefix +
// entityId refetches the right thread on whichever surface posted, with no per-page key.
export function useReplyToComment() {
  const qc = useQueryClient()
  const { notify } = useNotification()
  return React.useCallback(
    async (entityId: string, parentCommentId: string, draft: CommentDraft) => {
      await api.post("/comments/reply", {
        parentCommentId,
        body: draft.body,
        bodyJson: draft.bodyJson,
        mentions: draft.mentions,
      })
      await qc.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey
          return (
            Array.isArray(key) &&
            typeof key[0] === "string" &&
            (key[0].startsWith("work-notes-") || key[0].startsWith("customer-updates-")) &&
            key[1] === entityId
          )
        },
      })
      notify.success("Reply added")
    },
    [qc, notify]
  )
}
