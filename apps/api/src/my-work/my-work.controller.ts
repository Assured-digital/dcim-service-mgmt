import { Controller, Get, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { Role } from "@prisma/client"
import { getJwtUser } from "../auth/request-context"
import { MyWorkService } from "./my-work.service"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("my-work")
@ApiBearerAuth()
@Controller("my-work")
export class MyWorkController {
  constructor(private myWork: MyWorkService) {}

  @Get()
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
  )
  async get(@Req() req: any) {
    const user = getJwtUser(req)
    return this.myWork.getMyWork(user.userId, user.role as Role, user.clientId ?? null)
  }
}