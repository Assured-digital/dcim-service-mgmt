import { Injectable, Logger } from "@nestjs/common"
import { NotificationType } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { emitNotification } from "./emit-notification"
import { listWatcherIds } from "../record-watch/watchers"
import { TERMINAL_STATUSES } from "../common/list-scope"

// B3 Phase 3 — the time-based notification sweep. Mirrors the CRM sweep
// (crm.service.runSweep): an idempotent, org-wide maintenance pass triggered by an
// EXTERNAL schedule (Azure Container Apps job) via POST /notifications/sweep — NOT an
// in-process cron (there is no ScheduleModule in this app).
//
// It scans the three SLA/due-bearing work-items (Incident, ServiceRequest, Task — the
// types that carry `dueAt`) that are still open, and emits:
//   • DUE_SOON  when dueAt falls inside the next window and hasn't passed
//   • OVERDUE   when dueAt is already in the past
// Recipients = the assignee (emitNotification also folds in the record's watchers, and
// honours each recipient's per-type channel preferences). Actor is null (system).
//
// Idempotency: NotificationSweepMarker records one row per (record, signal), so each
// alert fires exactly once no matter how often the sweep runs. A record can still get
// both signals over its life (DUE_SOON as it approaches, then OVERDUE once it lapses).
//
// NOT covered yet (follow-ons): maintenance/check overdue (no assignee — needs an
// escalation target), unassigned-record escalation to service managers, and renewal
// due (already handled by the CRM sweep). Marker rows are never pruned (bounded by
// record count); add cleanup if it ever matters.

const DAY_MS = 86_400_000
// A record whose dueAt is within this window (and not yet past) is "due soon".
const DUE_SOON_WINDOW_MS = DAY_MS

type SweepTarget = {
  recordType: "Incident" | "ServiceRequest" | "Task"
  terminal: readonly string[]
  fetchOpenDue: (clientIds: string[], soonCutoff: Date) => Promise<
    { id: string; clientId: string; assigneeId: string | null; dueAt: Date | null }[]
  >
}

@Injectable()
export class NotificationSweepService {
  private readonly logger = new Logger("NotificationSweep")

  constructor(private prisma: PrismaService) {}

  private targets(): SweepTarget[] {
    const sel = { id: true, clientId: true, assigneeId: true, dueAt: true } as const
    // Loose where (like buildListScope): each model's `status` is its own enum, so the
    // shared shape is typed `any` and validated at the Prisma call.
    const open = (terminal: readonly string[], clientIds: string[], soonCutoff: Date): any => ({
      clientId: { in: clientIds },
      status: { notIn: terminal as unknown as string[] },
      dueAt: { not: null, lte: soonCutoff }
    })
    return [
      {
        recordType: "Incident",
        terminal: TERMINAL_STATUSES.incident,
        fetchOpenDue: (clientIds, soonCutoff) =>
          this.prisma.incident.findMany({ where: open(TERMINAL_STATUSES.incident, clientIds, soonCutoff), select: sel })
      },
      {
        recordType: "ServiceRequest",
        terminal: TERMINAL_STATUSES.serviceRequest,
        fetchOpenDue: (clientIds, soonCutoff) =>
          this.prisma.serviceRequest.findMany({ where: open(TERMINAL_STATUSES.serviceRequest, clientIds, soonCutoff), select: sel })
      },
      {
        recordType: "Task",
        terminal: TERMINAL_STATUSES.task,
        fetchOpenDue: (clientIds, soonCutoff) =>
          this.prisma.task.findMany({ where: open(TERMINAL_STATUSES.task, clientIds, soonCutoff), select: sel })
      }
    ]
  }

  // Claim the (record, signal) marker. Returns true if this call created it (first
  // time → emit), false if it already existed (already notified → skip). The unique
  // constraint makes the create the atomic guard even under concurrent sweeps.
  private async claimMarker(recordType: string, recordId: string, signal: string): Promise<boolean> {
    try {
      await this.prisma.notificationSweepMarker.create({ data: { recordType, recordId, signal } })
      return true
    } catch {
      return false
    }
  }

  async runSweep(organizationId: string) {
    const now = new Date()
    const soonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_MS)

    const clients = await this.prisma.client.findMany({
      where: { organizationId },
      select: { id: true }
    })
    const clientIds = clients.map((c) => c.id)

    let dueSoon = 0
    let overdue = 0

    if (clientIds.length) {
      for (const target of this.targets()) {
        const rows = await target.fetchOpenDue(clientIds, soonCutoff)
        for (const row of rows) {
          if (!row.dueAt) continue
          const isOverdue = row.dueAt.getTime() < now.getTime()
          const signal = isOverdue ? "OVERDUE" : "DUE_SOON"
          const type = isOverdue ? NotificationType.OVERDUE : NotificationType.DUE_SOON

          // Resolve recipients first (assignee + watchers). If there's nobody to tell,
          // skip WITHOUT claiming the marker — so a record that's unassigned/unwatched
          // now will still alert once someone is assigned to (or watches) it.
          const watchers = await listWatcherIds(this.prisma, target.recordType, row.id)
          const recipients = [...new Set([row.assigneeId, ...watchers].filter((id): id is string => !!id))]
          if (!recipients.length) continue

          // Fire once per (record, signal).
          const claimed = await this.claimMarker(target.recordType, row.id, signal)
          if (!claimed) continue

          // Best-effort emit (never throws): prefs-gated in-app + email per recipient.
          // (emit also re-folds watchers for these types — a harmless dedupe.)
          await emitNotification(this.prisma, {
            type,
            recipientIds: recipients,
            actorId: null,
            clientId: row.clientId,
            sourceType: target.recordType,
            sourceId: row.id
          })

          if (isOverdue) overdue++
          else dueSoon++
        }
      }
    }

    this.logger.log(
      `Notification sweep complete: org=${organizationId} clients=${clientIds.length} dueSoon=${dueSoon} overdue=${overdue}`
    )
    return { clientsSwept: clientIds.length, dueSoonNotified: dueSoon, overdueNotified: overdue }
  }
}
