import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { CommentsService } from "./comments.service"
import { CommentsController } from "./comments.controller"

@Module({
  imports: [PrismaModule],
  providers: [CommentsService],
  controllers: [CommentsController],
  exports: [CommentsService]
})
export class CommentsModule {}