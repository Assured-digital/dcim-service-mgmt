import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { WorkNotesController } from "./work-notes.controller"
import { WorkNotesService } from "./work-notes.service"

@Module({
  imports: [PrismaModule],
  controllers: [WorkNotesController],
  providers: [WorkNotesService],
})
export class WorkNotesModule {}
