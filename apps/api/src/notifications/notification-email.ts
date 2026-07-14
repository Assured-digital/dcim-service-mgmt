import { Logger } from "@nestjs/common"
import { NotificationType } from "@prisma/client"
import type { PrismaService } from "../prisma/prisma.service"
import { graphSendMail, mailSendConfigured } from "../msgraph/send-mail"

const logger = new Logger("notificationEmail")

// sourceType (PascalCase model name, matching the bell's routes) -> canonical web
// path. Callers pass only recipients who opted into email (Phase 2 preferences).
const RECORD_PATH: Record<string, string> = {
  Incident: "service-desk/inc",
  ServiceRequest: "service-desk/sr",
  ChangeRequest: "service-desk/chg",
  Task: "service-desk/task",
  Risk: "risks-issues/risks",
  Issue: "risks-issues/issues"
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
    if (!mailSendConfigured() || input.recipientIds.length === 0) return

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
    const SUBJECT: Record<string, string> = {
      ASSIGNED: `You've been assigned a ${label}`,
      MENTION: `${actorName} mentioned you on a ${label}`,
      STATUS_CHANGED: `Status updated on a ${label}`,
      REPLY: `${actorName} replied to you on a ${label}`
    }
    const LINE: Record<string, string> = {
      ASSIGNED: `${actorName} assigned you a ${label}.`,
      MENTION: `${actorName} mentioned you on a ${label}.`,
      STATUS_CHANGED: `${actorName} updated the status of a ${label}.`,
      REPLY: `${actorName} replied to you on a ${label}.`
    }
    const subject = SUBJECT[input.type] ?? `Update on a ${label}`
    const line = LINE[input.type] ?? `${actorName} updated a ${label}.`
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
