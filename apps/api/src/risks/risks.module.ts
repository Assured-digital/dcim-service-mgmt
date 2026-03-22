import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { RisksService } from "./risks.service"
import { RisksController } from "./risks.controller"

@Module({
  imports: [PrismaModule],
  providers: [RisksService],
  controllers: [RisksController],
  exports: [RisksService]
})
export class RisksModule {}