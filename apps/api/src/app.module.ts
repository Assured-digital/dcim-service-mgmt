import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { ClientsModule } from "./clients/clients.module";
import { ServiceRequestsModule } from "./service-requests/service-requests.module";
import { AssetsModule } from "./assets/assets.module";
import { SurveysModule } from "./surveys/surveys.module";
import { DocumentsModule } from "./documents/documents.module";
import { StorageModule } from "./storage/storage.module";
import { HealthController } from "./health/health.controller";
import { PublicSubmissionsModule } from "./public-submissions/public-submissions.module";
import { IncidentsModule } from "./incidents/incidents.module";
import { TasksModule } from "./tasks/tasks.module";
import { UsersModule } from "./users/users.module";
import { OrganizationsModule } from "./organizations/organizations.module";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuthModule,
    ClientsModule,
    ServiceRequestsModule,
    AssetsModule,
    SurveysModule,
    DocumentsModule,
    PublicSubmissionsModule,
    IncidentsModule,
    TasksModule,
    UsersModule,
    OrganizationsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
