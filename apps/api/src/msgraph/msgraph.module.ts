import { Module } from "@nestjs/common"
import { MsGraphService } from "./msgraph.service"

@Module({
  providers: [MsGraphService],
  exports: [MsGraphService]
})
export class MsGraphModule {}
