import { Logger } from "@nestjs/common"
import type { PrismaService } from "../prisma/prisma.service"

// Plain helpers (not injectable) so the best-effort emit + comment paths can call
// them without module wiring — mirrors emitNotification / autoWatch style.
const logger = new Logger("recordWatch")

// The user ids watching a record, optionally excluding one (e.g. the actor).
export async function listWatcherIds(
  prisma: PrismaService,
  recordType: string,
  recordId: string,
  excludeUserId?: string | null
): Promise<string[]> {
  const rows = await prisma.recordWatch.findMany({
    where: { recordType, recordId },
    select: { userId: true }
  })
  return rows.map((r) => r.userId).filter((id) => id !== excludeUserId)
}

// Best-effort auto-watch — e.g. when you comment on a record you start watching it.
// Never throws (idempotent upsert); the primary action is already committed.
export async function autoWatch(
  prisma: PrismaService,
  userId: string,
  recordType: string,
  recordId: string
): Promise<void> {
  try {
    await prisma.recordWatch.upsert({
      where: { userId_recordType_recordId: { userId, recordType, recordId } },
      create: { userId, recordType, recordId },
      update: {}
    })
  } catch (err) {
    logger.warn(`auto-watch failed for ${recordType} ${recordId}: ${(err as Error).message}`)
  }
}
