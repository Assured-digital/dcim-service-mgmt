import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentSeverity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { emitAudit } from "../audit-events/emit-audit";
import {
  ConvertTriageItemDto,
  TriageConvertTargetType,
  TriageLifecycleStatus,
  TriageSourceType
} from "./dto";

// Triage events are emitted with the PascalCase record name (NOT the raw enum) so they share the
// entity stream with that record's own CREATED event — one coherent per-record history (admin view #95).
function triageEntityType(sourceType: TriageSourceType): string {
  return sourceType === TriageSourceType.REQUEST_INTAKE ? "RequestIntake" : "PublicSubmission";
}

function makeServiceRequestRef() {
  const y = new Date().getFullYear();
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `SR-${y}-${n}`;
}

function makeIncidentRef() {
  const y = new Date().getFullYear();
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `IN-${y}-${n}`;
}

@Injectable()
export class TriageService {
  constructor(private prisma: PrismaService) {}

  async listQueue(clientId: string) {
    const [requestIntakes, publicSubmissions] = await Promise.all([
      this.prisma.requestIntake.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.publicSubmission.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" }
      })
    ]);

    return [
      ...requestIntakes.map((item) => ({
        id: item.id,
        sourceType: TriageSourceType.REQUEST_INTAKE,
        requesterName: item.requesterName,
        requesterEmail: item.requesterEmail,
        title: item.title,
        description: item.description,
        status: item.status,
        triageNotes: item.triageNotes,
        createdAt: item.createdAt,
        convertedEntityType: item.convertedEntityType,
        convertedEntityId: item.convertedEntityId
      })),
      ...publicSubmissions.map((item) => ({
        id: item.id,
        sourceType: TriageSourceType.PUBLIC_SUBMISSION,
        requesterName: item.requesterName,
        requesterEmail: item.requesterEmail,
        title: item.subject,
        description: item.description,
        status: item.status,
        triageNotes: item.triageNotes,
        createdAt: item.createdAt,
        convertedEntityType: item.convertedEntityType,
        convertedEntityId: item.convertedEntityId ?? item.convertedServiceRequestId
      }))
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async convert(
    clientId: string,
    sourceType: TriageSourceType,
    sourceId: string,
    actorUserId: string,
    dto: ConvertTriageItemDto
  ) {
    this.assertMandatoryConversionFields(dto);

    const result = await this.prisma.$transaction(async (tx) => {
      const source = await this.loadSourceForClient(tx, clientId, sourceType, sourceId);
      if (source.status !== "NEW" && source.status !== "UNDER_REVIEW") {
        throw new BadRequestException("Triage item is already processed.");
      }

      const target = await this.createTargetFromSource(tx, clientId, actorUserId, source, dto);

      if (sourceType === TriageSourceType.REQUEST_INTAKE) {
        await tx.requestIntake.update({
          where: { id: source.id },
          data: {
            status: "CONVERTED",
            triageNotes: dto.triageNotes,
            convertedEntityType: target.entityType,
            convertedEntityId: target.entityId,
            convertedAt: new Date()
          }
        });
      } else {
        await tx.publicSubmission.update({
          where: { id: source.id },
          data: {
            status: "CONVERTED",
            convertedEntityType: target.entityType,
            convertedEntityId: target.entityId,
            convertedServiceRequestId:
              target.entityType === TriageConvertTargetType.SERVICE_REQUEST ? target.entityId : null
          }
        });
      }

      return {
        sourceId: source.id,
        sourceTitle: source.title,
        targetType: target.entityType,
        targetId: target.entityId,
        targetReference: target.reference
      };
    });

    // Emitted post-commit through the single writer (emitAudit takes PrismaService, not a tx client).
    // reference = the created target's ref; title = the source's title.
    await emitAudit(this.prisma, {
      entityType: triageEntityType(sourceType),
      entityId: result.sourceId,
      action: "TRIAGE_CONVERTED",
      actorUserId,
      clientId,
      reference: result.targetReference,
      title: result.sourceTitle
    });

    return {
      sourceType,
      sourceId: result.sourceId,
      targetType: result.targetType,
      targetId: result.targetId
    };
  }

  async updateStatus(
    clientId: string,
    sourceType: TriageSourceType,
    sourceId: string,
    actorUserId: string,
    status: TriageLifecycleStatus,
    triageNotes?: string
  ) {
    if (status === TriageLifecycleStatus.REJECTED && !triageNotes?.trim()) {
      throw new BadRequestException("triageNotes are required when rejecting a triage item.");
    }

    const fromStatus = await this.prisma.$transaction(async (tx) => {
      const source = await this.loadSourceForClient(tx, clientId, sourceType, sourceId);
      if (source.status === "CONVERTED" || source.status === "REJECTED") {
        throw new BadRequestException("Triage item is already finalized.");
      }

      if (sourceType === TriageSourceType.REQUEST_INTAKE) {
        await tx.requestIntake.update({
          where: { id: sourceId },
          data: {
            status,
            triageNotes: triageNotes?.trim() || null
          }
        });
      } else {
        await tx.publicSubmission.update({
          where: { id: sourceId },
          data: {
            status,
            triageNotes: triageNotes?.trim() || null
          }
        });
      }

      return source.status;
    });

    // Emitted post-commit through the single writer. Status transition as a `changes` entry;
    // triageNotes carried as the transition `comment`.
    await emitAudit(this.prisma, {
      entityType: triageEntityType(sourceType),
      entityId: sourceId,
      action: "TRIAGE_STATUS_UPDATED",
      actorUserId,
      clientId,
      changes: [{ field: "status", label: "Status", from: fromStatus, to: status }],
      comment: triageNotes?.trim() || null
    });

    return {
      sourceType,
      sourceId,
      status
    };
  }

  private async loadSourceForClient(
    tx: Prisma.TransactionClient,
    clientId: string,
    sourceType: TriageSourceType,
    sourceId: string
  ) {
    if (sourceType === TriageSourceType.REQUEST_INTAKE) {
      const intake = await tx.requestIntake.findFirst({
        where: { id: sourceId, clientId }
      });
      if (!intake) throw new NotFoundException("Request intake not found");
      return {
        id: intake.id,
        title: intake.title,
        description: intake.description,
        status: intake.status
      };
    }

    const submission = await tx.publicSubmission.findFirst({
      where: { id: sourceId, clientId }
    });
    if (!submission) throw new NotFoundException("Public submission not found");
    return {
      id: submission.id,
      title: submission.subject,
      description: submission.description,
      status: submission.status
    };
  }

  private assertMandatoryConversionFields(dto: ConvertTriageItemDto) {
    if (!dto.priority?.trim()) {
      throw new BadRequestException("priority is required for conversion.");
    }
    if (dto.targetType === TriageConvertTargetType.INCIDENT && !dto.incidentSeverity) {
      throw new BadRequestException("incidentSeverity is required when converting to INCIDENT.");
    }
    if (dto.targetType === TriageConvertTargetType.TASK && !dto.taskDueAt) {
      throw new BadRequestException("taskDueAt is required when converting to TASK.");
    }
  }

  private async createTargetFromSource(
    tx: Prisma.TransactionClient,
    clientId: string,
    actorUserId: string,
    source: { title: string; description: string },
    dto: ConvertTriageItemDto
  ) {
    const title = dto.title?.trim() || source.title;
    const description = dto.description?.trim() || source.description;

    if (dto.targetType === TriageConvertTargetType.SERVICE_REQUEST) {
      const reference = await this.generateUniqueServiceRequestReference(tx);
      const sr = await tx.serviceRequest.create({
        data: {
          reference,
          clientId,
          subject: title,
          description,
          priority: dto.priority,
          createdById: actorUserId
        }
      });
      return {
        entityType: TriageConvertTargetType.SERVICE_REQUEST,
        entityId: sr.id,
        reference: sr.reference
      };
    }

    if (dto.targetType === TriageConvertTargetType.INCIDENT) {
      const reference = await this.generateUniqueIncidentReference(tx);
      const incident = await tx.incident.create({
        data: {
          reference,
          clientId,
          title,
          description,
          severity: dto.incidentSeverity ?? IncidentSeverity.MEDIUM,
          priority: dto.priority,
          createdById: actorUserId
        }
      });
      return {
        entityType: TriageConvertTargetType.INCIDENT,
        entityId: incident.id,
        reference: incident.reference
      };
    }

    const taskRef = await this.generateUniqueTaskReference(tx)
    const task = await tx.task.create({
      data: {
        reference: taskRef,
        clientId,
        title,
        description,
        priority: dto.priority,
        dueAt: dto.taskDueAt ? new Date(dto.taskDueAt) : undefined,
        createdById: actorUserId
      }
    });

    return {
      entityType: TriageConvertTargetType.TASK,
      entityId: task.id,
      reference: task.reference
    };
  }

  private async generateUniqueServiceRequestReference(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 10; i += 1) {
      const reference = makeServiceRequestRef();
      const exists = await tx.serviceRequest.findUnique({ where: { reference } });
      if (!exists) return reference;
    }
    throw new BadRequestException("Could not generate unique service request reference");
  }

  private async generateUniqueIncidentReference(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 10; i += 1) {
      const reference = makeIncidentRef()
      const exists = await tx.incident.findUnique({ where: { reference } })
      if (!exists) return reference
    }
    throw new BadRequestException("Could not generate unique incident reference")
  }

  private async generateUniqueTaskReference(tx: Prisma.TransactionClient) {
    const y = new Date().getFullYear()
    for (let i = 0; i < 10; i += 1) {
      const reference = `TSK-${y}-${Math.floor(Math.random() * 9000) + 1000}`
      const exists = await tx.task.findUnique({ where: { reference } })
      if (!exists) return reference
    }
    throw new BadRequestException("Could not generate unique task reference")
  }
}
