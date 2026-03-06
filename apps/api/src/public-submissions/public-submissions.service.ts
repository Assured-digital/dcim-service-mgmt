import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function makeRef() {
  const d = new Date();
  const y = d.getFullYear();
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `SR-${y}-${n}`;
}

@Injectable()
export class PublicSubmissionsService {
  constructor(private prisma: PrismaService) {}

  listForClient(clientId: string) {
    return this.prisma.publicSubmission.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" }
    });
  }

  createPublic(dto: {
    clientId: string;
    requesterName: string;
    requesterEmail: string;
    subject: string;
    description: string;
  }) {
    return this.prisma.publicSubmission.create({
      data: {
        clientId: dto.clientId,
        requesterName: dto.requesterName,
        requesterEmail: dto.requesterEmail,
        subject: dto.subject,
        description: dto.description,
        status: "NEW"
      }
    });
  }

  async convertForClient(
    clientId: string,
    submissionId: string,
    actorUserId: string,
    priority?: string
  ) {
    const submission = await this.prisma.publicSubmission.findFirst({
      where: { id: submissionId, clientId }
    });
    if (!submission) throw new NotFoundException("Public submission not found");

    if (submission.status !== "NEW") {
      throw new BadRequestException("Submission is already processed.");
    }

    const reference = await this.generateUniqueReference();

    const serviceRequest = await this.prisma.serviceRequest.create({
      data: {
        reference,
        clientId,
        subject: submission.subject,
        description: submission.description,
        priority: priority ?? "medium",
        createdById: actorUserId
      }
    });

    const updatedSubmission = await this.prisma.publicSubmission.update({
      where: { id: submission.id },
      data: {
        status: "CONVERTED",
        convertedServiceRequestId: serviceRequest.id,
        convertedEntityType: "SERVICE_REQUEST",
        convertedEntityId: serviceRequest.id
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "PublicSubmission",
        entityId: submission.id,
        action: "CONVERTED_TO_SERVICE_REQUEST",
        actorUserId,
        clientId,
        data: {
          serviceRequestId: serviceRequest.id,
          serviceRequestReference: serviceRequest.reference
        }
      }
    });

    return { submission: updatedSubmission, serviceRequest };
  }

  private async generateUniqueReference() {
    for (let i = 0; i < 10; i += 1) {
      const reference = makeRef();
      const exists = await this.prisma.serviceRequest.findUnique({ where: { reference } });
      if (!exists) return reference;
    }
    throw new BadRequestException("Could not generate unique service request reference");
  }
}
