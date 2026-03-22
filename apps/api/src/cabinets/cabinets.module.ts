import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { CabinetsService } from "./cabinets.service"
import { CabinetsController } from "./cabinets.controller"

@Module({
  imports: [PrismaModule],
  providers: [CabinetsService],
  controllers: [CabinetsController],
  exports: [CabinetsService]
})
export class CabinetsModule {}