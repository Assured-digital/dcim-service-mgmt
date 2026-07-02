import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { PortsController } from "./ports.controller"
import { PortsService } from "./ports.service"

@Module({
  imports: [PrismaModule],
  controllers: [PortsController],
  providers: [PortsService],
  exports: [PortsService],
})
export class PortsModule {}
