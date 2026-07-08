import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { SearchService } from "./search.service"
import { SearchController } from "./search.controller"

@Module({
  imports: [PrismaModule],
  providers: [SearchService],
  controllers: [SearchController]
})
export class SearchModule {}
