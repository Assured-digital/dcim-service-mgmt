import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { TasksModule } from "../tasks/tasks.module";
import { ChangesModule } from "../changes/changes.module";


@Module({
  // Tasks/Changes are the work-order records the MAC fusion raises against an
  // asset (neither module imports Assets, so no dependency cycle).
  imports: [TasksModule, ChangesModule],
  controllers: [AssetsController],
  providers: [AssetsService]
})
export class AssetsModule {}
