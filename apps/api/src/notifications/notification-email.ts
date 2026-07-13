import { Logger } from "@nestjs/common"
import { NotificationType } from "@prisma/client"
import type { PrismaService } from "../prisma/prisma.service"
import { graphSendMail, mailSendConfigured } from "../msgraph/send-mail"

const logger = new Logger("notificationEmail")

// Phase 1 emails only the high-signal "someone needs you" types. STATUS_CHANGED /
// REPLY stay in-app until per-user preferences (Phase 2) let people opt in.
const EMAIL_TYPES: NotificationType[] = [NotificationType.ASSIGNED, NotificationType.MENTION]

// sourceType -> web path segment. These legacy paths redirect to the canonical
// detail page, so the deep-link resolves regardless of routing changes.
const RECORD_PATH: Record<string, string> = {
  incident: "incidents",
  service_request: "service-requests",
  change: "changes",
  task: "tasks",
  risk: "risks",
  issue: "issues"
}

function recordUrl(sourceType: string, sourceId: string): string | null {
  const base = process.env.WEB_BASE_URL?.replace(/\/+$/, "")
  const seg = RECORD_PATH[sourceType]
  return base && seg ? `${base}/${seg}/${sourceId}` : null
}

export type NotificationEmailInput = {
  type: NotificationType
  recipientIds: string[]
  actorId: string | null
  sourceType: string
  sourceId: string
}

// Best-effort email fan-out for an emitted notification — mirrors emitNotification:
// never throws (the in-app notification is already written). Sends ONE email per
// recipient (individually, so recipients never see each other). Inert unless
// mailSendConfigured() and the type is email-eligible.
export async function sendNotificationEmails(prisma: PrismaService, input: NotificationEmailInput): Promise<void> {
  try {
    if (!mailSendConfigured() || !EMAIL_TYPES.includes(input.type) || input.recipientIds.length === 0) return

    const [recipients, actor] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: input.recipientIds }, isActive: true },
        select: { email: true }
      }),
      input.actorId
        ? prisma.user.findUnique({
            where: { id: input.actorId },
            select: { knownAs: true, firstName: true, lastName: true, email: true }
          })
        : Promise.resolve(null)
    ])

    const actorName =
      (actor && (actor.knownAs || `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() || actor.email)) || "Someone"
    const label = input.sourceType.replace(/_/g, " ")
    const url = recordUrl(input.sourceType, input.sourceId)
    const subject =
      input.type === NotificationType.ASSIGNED
        ? `You've been assigned a ${label}`
        : `${actorName} mentioned you on a ${label}`
    const line =
      input.type === NotificationType.ASSIGNED
        ? `${actorName} assigned you a ${label}.`
        : `${actorName} mentioned you on a ${label}.`
    const html =
      `<p>${line}</p>` +
      (url ? `<p><a href="${url}">Open it in AD Service Management</a></p>` : "") +
      `<hr><p style="color:#888;font-size:12px">You're receiving this because you're involved in this record.</p>`

    for (const r of recipients) {
      if (r.email) await graphSendMail([r.email], subject, html)
    }
  } catch (err) {
    logger.error(
      `Failed to email ${input.type} notification for ${input.sourceType} ${input.sourceId}`,
      err instanceof Error ? err.stack : String(err)
    )
  }
}
