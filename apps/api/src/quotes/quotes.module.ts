import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { WorkPackagesModule } from "../work-packages/work-packages.module"
import { QuotesService } from "./quotes.service"
import { QuotesController } from "./quotes.controller"

@Module({
  imports: [PrismaModule, WorkPackagesModule],
  providers: [QuotesService],
  controllers: [QuotesController],
  exports: [QuotesService]
})
export class QuotesModule {}
