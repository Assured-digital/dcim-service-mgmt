import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { resolveRecordSummary, AttachmentRecordType } from "../record-links/resolve-links"

// Watchable record types are the six work-items. recordType is the PascalCase model
// name (matching Notification.sourceType); mapped here to the resolver vocabulary for
// the clientId-scoped existence check — you can only watch a record in your scope.
const WATCHABLE: Record<string, AttachmentRecordType> = {
  Incident: "incident",
  ServiceRequest: "service_request",
  ChangeRequest: "change",
  Task: "task",
  Risk: "risk",
  Issue: "issue"
}

@Injectable()
export class WatchService {
  constructor(private prisma: PrismaService) {}

  private assertScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  // The record must be a watchable type AND exist in the caller's client scope, so a
  // spoofed id can't create a watch on another tenant's record.
  private async assertInScope(clientId: string, recordType: string, recordId: string) {
    const resolverType = WATCHABLE[recordType]
    if (!resolverType) throw new NotFoundException(`Not a watchable record type: ${recordType}`)
    const rec = await resolveRecordSummary(this.prisma, clientId, resolverType, recordId)
    if (!rec) throw new NotFoundException("Record not found in this client")
  }

  async watch(clientId: string, userId: string, recordType: string, recordId: string) {
    this.assertScope(clientId)
    await this.assertInScope(clientId, recordType, recordId)
    await this.prisma.recordWatch.upsert({
      where: { userId_recordType_recordId: { userId, recordType, recordId } },
      create: { userId, recordType, recordId },
      update: {}
    })
    return this.getStatus(clientId, userId, recordType, recordId)
  }

  async unwatch(clientId: string, userId: string, recordType: string, recordId: string) {
    this.assertScope(clientId)
    await this.prisma.recordWatch.deleteMany({ where: { userId, recordType, recordId } })
    return this.getStatus(clientId, userId, recordType, recordId)
  }

  async getStatus(clientId: string, userId: string, recordType: string, recordId: string) {
    this.assertScope(clientId)
    const [mine, watcherCount] = await Promise.all([
      this.prisma.recordWatch.findUnique({
        where: { userId_recordType_recordId: { userId, recordType, recordId } },
        select: { id: true }
      }),
      this.prisma.recordWatch.count({ where: { recordType, recordId } })
    ])
    return { watching: !!mine, watcherCount }
  }
}
