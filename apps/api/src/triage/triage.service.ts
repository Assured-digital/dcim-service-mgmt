import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { IncidentSeverity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ConvertTriageItemDto,
  TriageConvertTargetType,
  TriageLifecycleStatus,
  TriageSourceType
} from "./dto";

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

    return this.prisma.$transaction(async (tx) => {
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

      await tx.auditEvent.create({
        data: {
          entityType: sourceType,
          entityId: source.id,
          action: "TRIAGE_CONVERTED",
          actorUserId,
          clientId,
          data: {
            targetType: target.entityType,
            targetId: target.entityId
          }
        }
      });

      return {
        sourceType,
        sourceId: source.id,
        targetType: target.entityType,
        targetId: target.entityId
      };
    });
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

    return this.prisma.$transaction(async (tx) => {
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

      await tx.auditEvent.create({
        data: {
          entityType: sourceType,
          entityId: sourceId,
          action: "TRIAGE_STATUS_UPDATED",
          actorUserId,
          clientId,
          data: {
            status,
            triageNotes: triageNotes?.trim() || null
          }
        }
      });

      return {
        sourceType,
        sourceId,
        status
      };
    });
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
        entityId: sr.id
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
        entityId: incident.id
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
      entityId: task.id
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
