import { NotificationType } from "@prisma/client"
import type { PrismaService } from "../prisma/prisma.service"

export type Channels = { inApp: boolean; email: boolean }

// Defaults when a user has no explicit preference for a type. Preserves the
// pre-preferences behaviour: everything in-app; ASSIGNED + MENTION also email.
export const DEFAULT_CHANNELS: Record<NotificationType, Channels> = {
  ASSIGNED: { inApp: true, email: true },
  MENTION: { inApp: true, email: true },
  STATUS_CHANGED: { inApp: true, email: false },
  REPLY: { inApp: true, email: false }
}

export const NOTIFICATION_TYPES = Object.keys(DEFAULT_CHANNELS) as NotificationType[]

// Resolve each recipient's channels for a type — their stored preference, else the
// default — in one query for the whole recipient set.
export async function resolveChannels(
  prisma: PrismaService,
  recipientIds: string[],
  type: NotificationType
): Promise<Map<string, Channels>> {
  const out = new Map<string, Channels>(recipientIds.map((id) => [id, DEFAULT_CHANNELS[type]]))
  if (recipientIds.length === 0) return out
  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId: { in: recipientIds }, type },
    select: { userId: true, inApp: true, email: true }
  })
  for (const r of rows) out.set(r.userId, { inApp: r.inApp, email: r.email })
  return out
}
