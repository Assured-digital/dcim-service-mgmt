import { Logger } from "@nestjs/common"
import { NotificationType } from "@prisma/client"
import type { PrismaService } from "../prisma/prisma.service"
import { sendNotificationEmails } from "./notification-email"
import { resolveChannels } from "./preferences"
import { listWatcherIds } from "../record-watch/watchers"

// Single writer for event-driven notifications — a plain function taking the prisma
// client (NOT injectable), mirroring emitAudit (audit-events/emit-audit.ts) so it
// drops in beside the existing emitAudit(this.prisma, …) call in each service with no
// module wiring or constructor injection.
//
// Best-effort, like emitMentionNotifications (notifications.service.ts): the helper
// wraps everything in try/catch and SWALLOWS+logs. The primary write (the assignment
// or status change) is already committed by the time we get here, so a notification
// problem must NEVER 500 a successful update. This is the critical difference from
// emitAudit, which can throw at its call sites. Awaiting is safe — this never throws.
//
// The helper owns recipient hygiene so call sites stay tiny: it dedupes recipientIds,
// drops falsy ids, and drops the actor's own id (no "you assigned this to yourself").

const logger = new Logger("emitNotification")

// Types where the record's WATCHERS are notified alongside the direct recipients.
// COMMENT is handled explicitly in the comment flow (it needs mention-awareness), so
// it is deliberately NOT here.
const WATCH_NOTIFY_TYPES = new Set<NotificationType>([
  NotificationType.STATUS_CHANGED,
  NotificationType.DUE_SOON,
  NotificationType.OVERDUE
])

export type EmitNotificationInput = {
  type: NotificationType
  recipientIds: (string | null | undefined)[]
  actorId: string | null
  clientId: string
  sourceType: string
  sourceId: string
  commentId?: string | null
}

export async function emitNotification(
  prisma: PrismaService,
  input: EmitNotificationInput
): Promise<void> {
  try {
    let recipientIds = [
      ...new Set(
        input.recipientIds.filter(
          (id): id is string => !!id && id !== input.actorId
        )
      )
    ]

    // Watchers of the record also receive activity notifications (e.g. STATUS_CHANGED),
    // in addition to the direct recipients (assignee).
    if (WATCH_NOTIFY_TYPES.has(input.type)) {
      const watchers = await listWatcherIds(prisma, input.sourceType, input.sourceId, input.actorId)
      recipientIds = [...new Set([...recipientIds, ...watchers])]
    }

    if (!recipientIds.length) return

    // Per-recipient channel preferences (in-app / email) with sensible defaults.
    const channels = await resolveChannels(prisma, recipientIds, input.type)

    const inAppRecipients = recipientIds.filter((id) => channels.get(id)?.inApp)
    if (inAppRecipients.length) {
      await prisma.notification.createMany({
        data: inAppRecipients.map((recipientId) => ({
          recipientId,
          type: input.type,
          actorId: input.actorId,
          clientId: input.clientId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          commentId: input.commentId ?? null
        }))
      })
    }

    // Best-effort email to recipients who opted into email for this type.
    const emailRecipients = recipientIds.filter((id) => channels.get(id)?.email)
    await sendNotificationEmails(prisma, {
      type: input.type,
      recipientIds: emailRecipients,
      actorId: input.actorId,
      sourceType: input.sourceType,
      sourceId: input.sourceId
    })
  } catch (err) {
    // Best-effort: never propagate — the primary update has already been committed.
    logger.error(
      `Failed to emit ${input.type} notification for ${input.sourceType} ${input.sourceId}`,
      err instanceof Error ? err.stack : String(err)
    )
  }
}
