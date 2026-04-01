import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Role } from "@prisma/client"
import { isOrgSuperRole } from "../auth/role-scope"

@Injectable()
export class MyWorkService {
  constructor(private prisma: PrismaService) {}

  async getMyWork(userId: string, userRole: Role, userClientId: string | null) {
    // For org-level roles and service managers, query across all clients
    // For others, scope to their assigned client
    const clientFilter = isOrgSuperRole(userRole) || userRole === Role.SERVICE_MANAGER
      ? {}
      : { clientId: userClientId ?? undefined }

    const [checks, tasks] = await Promise.all([
      this.prisma.check.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
          ...clientFilter
        },
        include: {
          client: { select: { id: true, name: true } },
          site: { select: { id: true, name: true } },
          assignee: { select: { id: true, email: true } }
        },
        orderBy: { scheduledAt: "asc" }
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: ["DONE"] },
          ...clientFilter
        },
        include: {
          client: { select: { id: true, name: true } },
          assignee: { select: { id: true, email: true } }
        },
        orderBy: { dueAt: "asc" }
      })
    ])

    return { checks, tasks }
  }
}