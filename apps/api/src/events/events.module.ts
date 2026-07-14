import { Global, Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { DomainEventsService } from "./domain-events.service"
import { NotificationEventSubscriber } from "./notification-event.subscriber"

// @Global so any service can inject DomainEventsService without importing this module
// (the bus is a cross-cutting concern, like PrismaModule). EventEmitterModule.forRoot()
// is registered once in AppModule — it makes EventEmitter2 injectable app-wide and
// auto-discovers @OnEvent handlers on registered providers.
@Global()
@Module({
  imports: [PrismaModule],
  providers: [DomainEventsService, NotificationEventSubscriber],
  exports: [DomainEventsService]
})
export class EventsModule {}
