import { Injectable, Logger } from "@nestjs/common"
import { NotificationType } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { toUserDisplay, userDisplaySelect } from "../users/display"

// Newest-first list cap. The bell consumes the most recent slice; a hard cap keeps
// the response bounded (the [recipientId, readAt, createdAt] index serves the order).
const PAGE_SIZE = 50

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(private prisma: PrismaService) {}

  // Best-effort emit: one MENTION notification per mentioned user, fanned out from
  // the comment-create path. Reuses Phase 1's ALREADY-validated mention list — does
  // NOT re-derive or re-validate. Self-mentions are skipped (no "you mentioned you").
  //
  // Failures are logged and SWALLOWED: the comment is the primary write and is
  // already committed by the time we get here, so a notification problem must never
  // roll back a posted comment. Awaiting is safe — this never throws.
  async emitMentionNotifications(params: {
    clientId: string
    actorId: string
    sourceType: string
    sourceId: string
    commentId: string
    mentions: { targetType: string; targetId: string }[]
  }): Promise<void> {
    try {
      const recipientIds = [
        ...new Set(
          params.mentions
            .filter((m) => m.targetType === "user" && m.targetId !== params.actorId)
            .map((m) => m.targetId)
        )
      ]
      if (!recipientIds.length) return

      await this.prisma.notification.createMany({
        data: recipientIds.map((recipientId) => ({
          recipientId,
          type: NotificationType.MENTION,
          actorId: params.actorId,
          clientId: params.clientId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          commentId: params.commentId
        }))
      })
    } catch (err) {
      // Best-effort: never propagate — the comment has already been posted.
      this.logger.error(
        `Failed to emit mention notifications for comment ${params.commentId}`,
        err instanceof Error ? err.stack : String(err)
      )
    }
  }

  // The authenticated user's own notifications under the scoped client, newest first,
  // plus the unread count for the bell badge. Two-axis scoped: recipientId (you only
  // see your own) AND clientId (your current tenant).
  async listForUser(clientId: string, userId: string) {
    const where = { recipientId: userId, clientId }
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        include: { actor: { select: userDisplaySelect } }
      }),
      this.prisma.notification.count({ where: { ...where, readAt: null } })
    ])

    return {
      unreadCount,
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        // #99: resolved fresh, never stored. null if the actor was since removed.
        actor: toUserDisplay(n.actor),
        sourceType: n.sourceType,
        sourceId: n.sourceId,
        commentId: n.commentId,
        readAt: n.readAt,
        createdAt: n.createdAt
      }))
    }
  }

  // Lightweight unread count for the bell badge to poll without fetching the list.
  async unreadCount(clientId: string, userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId: userId, clientId, readAt: null }
    })
    return { unreadCount }
  }

  // Mark a single notification read — only if it belongs to the requesting user in
  // the scoped client. updateMany (not update) so a foreign/mismatched id is a no-op
  // (count: 0), never a cross-user write or a 500.
  async markRead(clientId: string, userId: string, id: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, recipientId: userId, clientId, readAt: null },
      data: { readAt: new Date() }
    })
    return { updated: res.count }
  }

  // Mark all of the user's unread notifications read in the scoped client.
  async markAllRead(clientId: string, userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { recipientId: userId, clientId, readAt: null },
      data: { readAt: new Date() }
    })
    return { updated: res.count }
  }
}
