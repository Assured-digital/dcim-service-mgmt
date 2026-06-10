import { Module } from "@nestjs/common";
import { RecordLinksController } from "./record-links.controller";
import { RecordLinksService } from "./record-links.service";

@Module({
  controllers: [RecordLinksController],
  providers: [RecordLinksService]
})
export class RecordLinksModule {}
