import { BadRequestException, Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { NotificationsService } from "../notifications/notifications.service"
import { computeDisplayName, toUserDisplay, userDisplaySelect, type UserDisplayPick } from "../users/display"
import { assertEntityInScope } from "./resolve-comment-scope"
import { resolveValidMentions, type MentionInput } from "./resolve-mentions"
import { tiptapToPlainText } from "./tiptap-text"

// Every comment read includes the author + raw mention rows via this include;
// present() swaps the author to { id, displayName } and resolves each mention's
// display name fresh.
const commentInclude = {
  author: { select: userDisplaySelect },
  mentions: { select: { targetType: true, targetId: true } }
} as const

type CommentRow = {
  author: UserDisplayPick | null
  mentions: { targetType: string; targetId: string }[]
}

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // Resolves the final non-empty plain-text body: derived from bodyJson when
  // present (source of truth for rich comments), else the client-sent body.
  private deriveBody(body: string | undefined, bodyJson: unknown): string {
    const derived = bodyJson != null ? tiptapToPlainText(bodyJson) : ""
    const finalBody = (derived || body || "").trim()
    if (!finalBody) throw new BadRequestException("Comment body cannot be empty")
    return finalBody
  }

  // Resolves mention display names fresh (#99 convention — never stored) for a
  // set of comment rows, batched into one user lookup, then maps every row to
  // its client-facing shape: author -> { id, displayName } and each mention ->
  // { targetType, targetId, displayName }.
  private async present<T extends CommentRow>(rows: T[]) {
    const userIds = [
      ...new Set(
        rows.flatMap((r) => r.mentions).filter((m) => m.targetType === "user").map((m) => m.targetId)
      )
    ]
    const displayMap = new Map<string, string>()
    if (userIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: userDisplaySelect
      })
      for (const u of users) displayMap.set(u.id, computeDisplayName(u))
    }

    return rows.map((row) => ({
      ...row,
      author: toUserDisplay(row.author),
      mentions: row.mentions.map((m) => ({
        targetType: m.targetType,
        targetId: m.targetId,
        // Unresolved (e.g. user since removed) -> null; frontend renders a fallback.
        displayName: m.targetType === "user" ? displayMap.get(m.targetId) ?? null : null
      }))
    }))
  }

  private async presentOne<T extends CommentRow>(row: T) {
    return (await this.present([row]))[0]
  }

  async listForEntity(clientId: string, entityType: string, entityId: string) {
    await assertEntityInScope(this.prisma, clientId, entityType, entityId)
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
      include: commentInclude
    })
    return this.present(rows)
  }

  async createWorkNote(clientId: string, authorId: string, dto: {
    entityType: string
    entityId: string
    body?: string
    bodyJson?: Record<string, unknown>
    mentions?: MentionInput[]
    serviceRequestId?: string
  }) {
    await assertEntityInScope(this.prisma, clientId, dto.entityType, dto.entityId)
    const body = this.deriveBody(dto.body, dto.bodyJson)
    const mentions = await resolveValidMentions(this.prisma, clientId, authorId, dto.mentions)
    const comment = await this.prisma.comment.create({
      data: {
        authorId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        body,
        bodyJson: (dto.bodyJson ?? undefined) as Prisma.InputJsonValue | undefined,
        type: "WORK_NOTE",
        visibleToCustomer: false,
        fromCustomer: false,
        serviceRequestId: dto.serviceRequestId,
        mentions: { create: mentions.map((m) => ({ targetType: m.targetType, targetId: m.targetId })) }
      },
      include: commentInclude
    })
    // Emit one MENTION notification per mentioned user (best-effort — never blocks
    // the posted comment). Reuses the validated `mentions` list; self-skip in the service.
    await this.notifications.emitMentionNotifications({
      clientId,
      actorId: authorId,
      sourceType: dto.entityType,
      sourceId: dto.entityId,
      commentId: comment.id,
      mentions
    })
    return this.presentOne(comment)
  }

  async createCustomerUpdate(clientId: string, authorId: string, dto: {
    entityType: string
    entityId: string
    body?: string
    bodyJson?: Record<string, unknown>
    mentions?: MentionInput[]
    fromCustomer?: boolean
    serviceRequestId?: string
  }) {
    await assertEntityInScope(this.prisma, clientId, dto.entityType, dto.entityId)
    const body = this.deriveBody(dto.body, dto.bodyJson)
    const mentions = await resolveValidMentions(this.prisma, clientId, authorId, dto.mentions)
    const comment = await this.prisma.comment.create({
      data: {
        authorId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        body,
        bodyJson: (dto.bodyJson ?? undefined) as Prisma.InputJsonValue | undefined,
        type: "CUSTOMER_UPDATE",
        visibleToCustomer: true,
        fromCustomer: dto.fromCustomer ?? false,
        serviceRequestId: dto.serviceRequestId,
        mentions: { create: mentions.map((m) => ({ targetType: m.targetType, targetId: m.targetId })) }
      },
      include: commentInclude
    })
    await this.notifications.emitMentionNotifications({
      clientId,
      actorId: authorId,
      sourceType: dto.entityType,
      sourceId: dto.entityId,
      commentId: comment.id,
      mentions
    })
    return this.presentOne(comment)
  }

  async listWorkNotes(clientId: string, entityType: string, entityId: string) {
    await assertEntityInScope(this.prisma, clientId, entityType, entityId)
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId, type: "WORK_NOTE" },
      orderBy: { createdAt: "asc" },
      include: commentInclude
    })
    return this.present(rows)
  }

  async listCustomerUpdates(clientId: string, entityType: string, entityId: string) {
    await assertEntityInScope(this.prisma, clientId, entityType, entityId)
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId, type: "CUSTOMER_UPDATE" },
      orderBy: { createdAt: "asc" },
      include: commentInclude
    })
    return this.present(rows)
  }
}
