import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { CabinetsService } from "./cabinets.service"
import { CabinetsController } from "./cabinets.controller"
import { ReservationsService } from "./reservations.service"
import { ReservationsController } from "./reservations.controller"

@Module({
  imports: [PrismaModule],
  providers: [CabinetsService, ReservationsService],
  controllers: [CabinetsController, ReservationsController],
  exports: [CabinetsService]
})
export class CabinetsModule {}