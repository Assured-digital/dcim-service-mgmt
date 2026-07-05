import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { TasksModule } from "../tasks/tasks.module"
import { ActivitiesService } from "./activities.service"
import { ActivitiesController } from "./activities.controller"

@Module({
  imports: [PrismaModule, TasksModule],
  providers: [ActivitiesService],
  controllers: [ActivitiesController],
  exports: [ActivitiesService]
})
export class ActivitiesModule {}
