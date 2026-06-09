import { Controller, Get, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { Role } from "@prisma/client"
import { getJwtUser, resolveAssignedClient } from "../auth/request-context"
import { isOrgSuperRole } from "../auth/role-scope"
import { PrismaService } from "../prisma/prisma.service"
import { MyWorkService } from "./my-work.service"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("my-work")
@ApiBearerAuth()
@Controller("my-work")
export class MyWorkController {
  constructor(private myWork: MyWorkService, private prisma: PrismaService) {}

  @Get()
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
  )
  async get(@Req() req: any) {
    const user = getJwtUser(req)
    const role = user.role as Role
    // org-super and service managers query across all clients (clientId ignored by
    // the service); client-scoped roles resolve their assigned client.
    const clientId =
      isOrgSuperRole(role) || role === Role.SERVICE_MANAGER
        ? null
        : await resolveAssignedClient(user, undefined, this.prisma)
    return this.myWork.getMyWork(user.userId, role, clientId)
  }
}