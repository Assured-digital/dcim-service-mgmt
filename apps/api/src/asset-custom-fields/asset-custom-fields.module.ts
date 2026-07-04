import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { AssetCustomFieldsController } from "./asset-custom-fields.controller"
import { AssetCustomFieldsService } from "./asset-custom-fields.service"

@Module({
  imports: [PrismaModule],
  controllers: [AssetCustomFieldsController],
  providers: [AssetCustomFieldsService],
})
export class AssetCustomFieldsModule {}
