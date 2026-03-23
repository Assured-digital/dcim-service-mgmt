import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { IssuesService } from "./issues.service"
import { IssuesController } from "./issues.controller"

@Module({
  imports: [PrismaModule],
  providers: [IssuesService],
  controllers: [IssuesController],
  exports: [IssuesService]
})
export class IssuesModule {}