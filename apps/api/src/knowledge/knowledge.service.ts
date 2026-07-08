import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { KnowledgeStatus, Prisma, Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { resolveCreator } from "../users/creator"
import { emitAudit } from "../audit-events/emit-audit"
import type { ScopeViewer } from "../auth/role-scope"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `KB-${y}-${n}`
}

type CreateInput = {
  title: string
  body: string
  category?: string
  status?: string
  tags?: string[]
  shared?: boolean
}
type UpdateInput = Partial<CreateInput>

@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}

  // The scoped client's organization (articles belong to an org; shared ones have
  // no clientId). Derived from the resolved client so it can't be spoofed.
  private async orgForClient(clientId: string): Promise<string> {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { organizationId: true }
    })
    if (!client?.organizationId) throw new ForbiddenException("Missing organization scope")
    return client.organizationId
  }

  private isClientViewer(viewer: ScopeViewer) {
    return viewer.role === Role.CLIENT_VIEWER
  }

  // Visible = same org AND (shared OR this client). Client-viewers only see
  // published articles; AD staff see every status (optionally filtered).
  private visibilityWhere(
    organizationId: string,
    clientId: string,
    viewer: ScopeViewer,
    filters: { q?: string; status?: string }
  ): Prisma.KnowledgeArticleWhereInput {
    const and: Prisma.KnowledgeArticleWhereInput[] = [
      { OR: [{ clientId: null }, { clientId }] }
    ]
    if (filters.q) {
      and.push({
        OR: [
          { title: { contains: filters.q, mode: "insensitive" } },
          { body: { contains: filters.q, mode: "insensitive" } }
        ]
      })
    }
    const status = this.isClientViewer(viewer)
      ? KnowledgeStatus.PUBLISHED
      : (filters.status as KnowledgeStatus | undefined)
    return { organizationId, AND: and, ...(status ? { status } : {}) }
  }

  private shape<T extends { clientId: string | null }>(row: T) {
    return { ...row, shared: row.clientId === null }
  }

  async listForClient(clientId: string, viewer: ScopeViewer, filters: { q?: string; status?: string } = {}) {
    const organizationId = await this.orgForClient(clientId)
    const rows = await this.prisma.knowledgeArticle.findMany({
      where: this.visibilityWhere(organizationId, clientId, viewer, filters),
      orderBy: { updatedAt: "desc" }
    })
    return rows.map((r) => this.shape(r))
  }

  async getForClient(clientId: string, id: string, viewer: ScopeViewer) {
    const organizationId = await this.orgForClient(clientId)
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id, ...this.visibilityWhere(organizationId, clientId, viewer, {}) }
    })
    if (!article) throw new NotFoundException("Article not found")
    const createdBy = await resolveCreator(this.prisma, article.createdById)
    return { ...this.shape(article), createdBy }
  }

  async createForClient(clientId: string, actorUserId: string, dto: CreateInput) {
    const organizationId = await this.orgForClient(clientId)
    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      if (await this.prisma.knowledgeArticle.findUnique({ where: { reference } })) continue
      const article = await this.prisma.knowledgeArticle.create({
        data: {
          reference,
          organizationId,
          clientId: dto.shared ? null : clientId,
          title: dto.title,
          body: dto.body,
          category: dto.category?.trim() || "General",
          status: (dto.status as KnowledgeStatus) ?? KnowledgeStatus.DRAFT,
          tags: dto.tags ?? [],
          createdById: actorUserId
        }
      })
      await emitAudit(this.prisma, {
        entityType: "KnowledgeArticle",
        entityId: article.id,
        action: "CREATED",
        actorUserId,
        clientId,
        reference: article.reference,
        title: article.title
      })
      return this.shape(article)
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: UpdateInput, viewer: ScopeViewer) {
    // Existence + visibility check (throws 404 if out of scope).
    await this.getForClient(clientId, id, viewer)
    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        category: dto.category?.trim() || undefined,
        status: dto.status as KnowledgeStatus | undefined,
        tags: dto.tags ?? undefined,
        // Re-scope only when `shared` is explicitly provided.
        clientId: dto.shared === undefined ? undefined : dto.shared ? null : clientId
      }
    })
    await emitAudit(this.prisma, {
      entityType: "KnowledgeArticle",
      entityId: updated.id,
      action: "UPDATED",
      actorUserId,
      clientId,
      reference: updated.reference,
      title: updated.title
    })
    return this.shape(updated)
  }
}
