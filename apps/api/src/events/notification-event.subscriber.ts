import { Injectable } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { NotificationType } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { emitNotification } from "../notifications/emit-notification"
import { RECORD_ASSIGNED, RECORD_STATUS_CHANGED, type RecordLifecyclePayload } from "./domain-events"

// The reaction the six work-item services used to call inline. emitNotification is
// best-effort (never throws), folds in the record's watchers, and applies each
// recipient's channel preferences — so routing STATUS_CHANGED / ASSIGNED through the bus
// leaves notification behaviour identical, only decoupled from the emitter.
@Injectable()
export class NotificationEventSubscriber {
  constructor(private prisma: PrismaService) {}

  @OnEvent(RECORD_STATUS_CHANGED)
  async onStatusChanged(p: RecordLifecyclePayload): Promise<void> {
    await emitNotification(this.prisma, {
      type: NotificationType.STATUS_CHANGED,
      recipientIds: [p.assigneeId],
      actorId: p.actorId,
      clientId: p.clientId,
      sourceType: p.recordType,
      sourceId: p.recordId
    })
  }

  @OnEvent(RECORD_ASSIGNED)
  async onAssigned(p: RecordLifecyclePayload): Promise<void> {
    await emitNotification(this.prisma, {
      type: NotificationType.ASSIGNED,
      recipientIds: [p.assigneeId],
      actorId: p.actorId,
      clientId: p.clientId,
      sourceType: p.recordType,
      sourceId: p.recordId
    })
  }
}
