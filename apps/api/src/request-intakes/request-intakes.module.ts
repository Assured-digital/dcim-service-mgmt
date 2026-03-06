import { Module } from "@nestjs/common";
import { RequestIntakesController } from "./request-intakes.controller";
import { RequestIntakesService } from "./request-intakes.service";

@Module({
  controllers: [RequestIntakesController],
  providers: [RequestIntakesService]
})
export class RequestIntakesModule {}

