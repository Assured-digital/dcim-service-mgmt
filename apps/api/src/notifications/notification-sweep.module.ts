import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { NotificationSweepService } from "./notification-sweep.service"

// Lean module for the time-based notification sweep — Prisma + the sweep service only.
// This lets the scheduled JOB_MODE=notif-sweep CLI bootstrap it as a MINIMAL application
// context (no controllers, no auth stack / JWT_SECRET), mirroring
// SharePointProvisioningModule for the provisioner job. Exported so NotificationsModule's
// controller can also inject it for POST /notifications/sweep.
@Module({
  imports: [PrismaModule],
  providers: [NotificationSweepService],
  exports: [NotificationSweepService]
})
export class NotificationSweepModule {}
