import { BadRequestException, Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { NotificationsService } from "../notifications/notifications.service"
import { computeDisplayName, toUserDisplay, userDisplaySelect, type UserDisplayPick } from "../users/display"
import { emitAudit } from "../audit-events/emit-audit"
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

  // Two-level threaded read. Returns top-level comments (posts) each with a nested
  // `replies` array (flat, one level — NOT recursive). Three queries regardless of
  // thread count (no N+1):
  //   1. the posts (parentCommentId IS NULL) for this entity (+ optional type filter)
  //   2. ALL their replies in one go (parentCommentId IN [postIds])
  //   3. one batched mention-user lookup inside present() over posts + replies
  // Replies inherit the post's entity context on create, so fetching by parent id is
  // already client-scoped. Replies are ordered oldest-first within a thread (natural
  // reading order). Existing data is unaffected: every pre-threading comment has
  // parentCommentId = NULL, so it stays a top-level post.
  private async listThreaded(
    clientId: string,
    entityType: string,
    entityId: string,
    extraWhere: Prisma.CommentWhereInput = {}
  ) {
    await assertEntityInScope(this.prisma, clientId, entityType, entityId)
    const posts = await this.prisma.comment.findMany({
      where: { entityType, entityId, parentCommentId: null, ...extraWhere },
      orderBy: { createdAt: "asc" },
      include: commentInclude
    })
    const replies = posts.length
      ? await this.prisma.comment.findMany({
          where: { parentCommentId: { in: posts.map((p) => p.id) } },
          orderBy: { createdAt: "asc" },
          include: commentInclude
        })
      : []

    // Present posts + replies together so mentions resolve in ONE batched lookup,
    // then split back and nest replies under their parent.
    const presented = await this.present([...posts, ...replies])
    const presentedPosts = presented.slice(0, posts.length)
    const presentedReplies = presented.slice(posts.length)

    const byParent = new Map<string, typeof presentedReplies>()
    for (const r of presentedReplies) {
      const arr = byParent.get(r.parentCommentId!) ?? []
      arr.push(r)
      byParent.set(r.parentCommentId!, arr)
    }
    return presentedPosts.map((p) => ({ ...p, replies: byParent.get(p.id) ?? [] }))
  }

  async listForEntity(clientId: string, entityType: string, entityId: string) {
    return this.listThreaded(clientId, entityType, entityId)
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
    await emitAudit(this.prisma, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      action: "COMMENTED",
      actorUserId: authorId,
      clientId
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
    await emitAudit(this.prisma, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      action: "COMMENTED",
      actorUserId: authorId,
      clientId
    })
    return this.presentOne(comment)
  }

  async listWorkNotes(clientId: string, entityType: string, entityId: string) {
    return this.listThreaded(clientId, entityType, entityId, { type: "WORK_NOTE" })
  }

  async listCustomerUpdates(clientId: string, entityType: string, entityId: string) {
    return this.listThreaded(clientId, entityType, entityId, { type: "CUSTOMER_UPDATE" })
  }

  // Create a reply to a top-level comment. A reply is a full rich comment (reuses the
  // Phase 1 path — deriveBody + resolveValidMentions) that carries a parent and
  // INHERITS the parent's entity context (entityType/entityId/type/visibility), so it
  // is scoped + fetched with the same post.
  //
  // Two-level validation (load-bearing — the schema permits deeper nesting; this is
  // the ONLY enforcement of "no reply to a reply"):
  //   (a) parent exists,
  //   (b) parent is in the actor's client scope (via assertEntityInScope on the
  //       parent's own entity — comments carry no clientId), and
  //   (c) parent is itself top-level (parentCommentId IS NULL).
  async createReply(clientId: string, authorId: string, dto: {
    parentCommentId: string
    body?: string
    bodyJson?: Record<string, unknown>
    mentions?: MentionInput[]
  }) {
    const parent = await this.prisma.comment.findUnique({
      where: { id: dto.parentCommentId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        parentCommentId: true,
        authorId: true,
        type: true,
        visibleToCustomer: true,
        serviceRequestId: true
      }
    })
    if (!parent) throw new BadRequestException("Parent comment not found")
    // Parent must belong to the actor's client (inherited via its entity). Throws
    // Forbidden for an out-of-scope / cross-client parent — closes the isolation gap.
    await assertEntityInScope(this.prisma, clientId, parent.entityType, parent.entityId)
    // Two-level only: you cannot reply to a reply.
    if (parent.parentCommentId !== null) {
      throw new BadRequestException("Cannot reply to a reply — threads are two levels deep")
    }

    const body = this.deriveBody(dto.body, dto.bodyJson)
    const mentions = await resolveValidMentions(this.prisma, clientId, authorId, dto.mentions)
    const reply = await this.prisma.comment.create({
      data: {
        authorId,
        // Inherit the post's context — a reply belongs to the same record + thread.
        entityType: parent.entityType,
        entityId: parent.entityId,
        body,
        bodyJson: (dto.bodyJson ?? undefined) as Prisma.InputJsonValue | undefined,
        type: parent.type,
        visibleToCustomer: parent.visibleToCustomer,
        fromCustomer: false,
        serviceRequestId: parent.serviceRequestId ?? undefined,
        parentCommentId: parent.id,
        mentions: { create: mentions.map((m) => ({ targetType: m.targetType, targetId: m.targetId })) }
      },
      include: commentInclude
    })

    // A reply's @mentions still fire MENTION notifications, unchanged (Phase 2).
    await this.notifications.emitMentionNotifications({
      clientId,
      actorId: authorId,
      sourceType: parent.entityType,
      sourceId: parent.entityId,
      commentId: reply.id,
      mentions
    })
    // ...and the post author gets a REPLY notification (self-skip + mention-dedupe
    // handled in the emit). The scroll target is the reply.
    await this.notifications.emitReplyNotification({
      clientId,
      actorId: authorId,
      recipientId: parent.authorId,
      sourceType: parent.entityType,
      sourceId: parent.entityId,
      commentId: reply.id,
      mentionedUserIds: mentions.filter((m) => m.targetType === "user").map((m) => m.targetId)
    })

    await emitAudit(this.prisma, {
      entityType: parent.entityType,
      entityId: parent.entityId,
      action: "REPLIED",
      actorUserId: authorId,
      clientId
    })

    return this.presentOne(reply)
  }
}
