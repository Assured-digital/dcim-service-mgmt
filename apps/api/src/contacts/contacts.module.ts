import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { ContactsService } from "./contacts.service"
import { ContactsController } from "./contacts.controller"

@Module({
  imports: [PrismaModule],
  providers: [ContactsService],
  controllers: [ContactsController],
  exports: [ContactsService]
})
export class ContactsModule {}
