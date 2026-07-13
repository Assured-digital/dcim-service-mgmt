import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { SharePointProvisioningService } from "./provisioning.service"

// Provides the provisioner service. It's constructed in the API too (harmless — it
// only acts when sweep()/provisionClient() is called, which ONLY the provisioning
// job's CLI does; the API never calls it and its Sites.Selected identity couldn't
// perform the elevated calls anyway).
@Module({
  imports: [PrismaModule],
  providers: [SharePointProvisioningService],
  exports: [SharePointProvisioningService]
})
export class SharePointProvisioningModule {}
