import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { resolveRecordSummary } from "../record-links/resolve-links"
import { toUserDisplay, userDisplaySelect } from "../users/display"
import { isOrgSuperRole } from "../auth/role-scope"
import { Role } from "@prisma/client"

// Timestamped work notes on the DCIM estate entities (Hyperview pattern).
// Tenant chokepoint: every read filters by the validated clientId; every write
// first proves the target entity exists IN that client via resolveRecordSummary
// (the same existence/tenant check attachments use), so a spoofed x-client-id
// can neither read nor pin notes onto another tenant's estate.
export const WORK_NOTE_ENTITY_TYPES = ["asset", "cabinet", "site"] as const
export type WorkNoteEntityType = (typeof WORK_NOTE_ENTITY_TYPES)[number]

@Injectable()
export class WorkNotesService {
  constructor(private prisma: PrismaService) {}

  private async assertEntityInScope(clientId: string, entityType: WorkNoteEntityType, entityId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const target = await resolveRecordSummary(this.prisma, clientId, entityType, entityId)
    if (!target) throw new NotFoundException(`Record not found in this client: ${entityType}`)
  }

  async listForEntity(clientId: string, entityType: WorkNoteEntityType, entityId: string) {
    await this.assertEntityInScope(clientId, entityType, entityId)
    const rows = await this.prisma.workNote.findMany({
      where: { clientId, entityType, entityId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: userDisplaySelect } },
    })
    return rows.map((r) => ({
      id: r.id, body: r.body, createdAt: r.createdAt.toISOString(),
      author: toUserDisplay(r.author),
    }))
  }

  async create(clientId: string, actorUserId: string, entityType: WorkNoteEntityType, entityId: string, body: string) {
    await this.assertEntityInScope(clientId, entityType, entityId)
    const note = await this.prisma.workNote.create({
      data: { clientId, entityType, entityId, authorId: actorUserId, body: body.trim() },
      include: { author: { select: userDisplaySelect } },
    })
    return { id: note.id, body: note.body, createdAt: note.createdAt.toISOString(), author: toUserDisplay(note.author) }
  }

  // Authors delete their own notes; org-super and service managers delete any.
  async remove(clientId: string, actorUserId: string, actorRole: Role, noteId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const note = await this.prisma.workNote.findFirst({ where: { id: noteId, clientId } })
    if (!note) throw new NotFoundException("Note not found")
    const mayModerate = isOrgSuperRole(actorRole) || actorRole === Role.SERVICE_MANAGER
    if (!mayModerate && note.authorId !== actorUserId) {
      throw new ForbiddenException("You can only delete your own notes")
    }
    await this.prisma.workNote.delete({ where: { id: note.id } })
    return { ok: true }
  }
}
