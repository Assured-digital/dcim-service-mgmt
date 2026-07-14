import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { NotificationsService } from "./notifications.service"
import { NotificationSweepService } from "./notification-sweep.service"
import { NotificationsController } from "./notifications.controller"

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, NotificationSweepService],
  controllers: [NotificationsController],
  // Exported so the comment-create path (CommentsModule) can emit on mention.
  exports: [NotificationsService]
})
export class NotificationsModule {}
