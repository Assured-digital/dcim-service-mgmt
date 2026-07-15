import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { NotificationsService } from "./notifications.service"
import { NotificationSweepModule } from "./notification-sweep.module"
import { NotificationsController } from "./notifications.controller"

@Module({
  // NotificationSweepModule provides NotificationSweepService (also used standalone by
  // the JOB_MODE=notif-sweep CLI); the controller injects it for POST /notifications/sweep.
  imports: [PrismaModule, NotificationSweepModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  // Exported so the comment-create path (CommentsModule) can emit on mention.
  exports: [NotificationsService]
})
export class NotificationsModule {}
