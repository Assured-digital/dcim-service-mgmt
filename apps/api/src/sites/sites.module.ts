import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { SitesService } from "./sites.service"
import { SitesController } from "./sites.controller"

@Module({
  imports: [PrismaModule],
  providers: [SitesService],
  controllers: [SitesController],
  exports: [SitesService]
})
export class SitesModule {}