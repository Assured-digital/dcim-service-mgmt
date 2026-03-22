import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { ChangesService } from "./changes.service"
import { ChangesController } from "./changes.controller"

@Module({
  imports: [PrismaModule],
  providers: [ChangesService],
  controllers: [ChangesController],
  exports: [ChangesService]
})
export class ChangesModule {}