import { SitesModule } from "./sites/sites.module"
import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { OidcModule } from "./auth/oidc.module";
import { ClientsModule } from "./clients/clients.module";
import { ServiceRequestsModule } from "./service-requests/service-requests.module";
import { AssetsModule } from "./assets/assets.module";
import { ChecksModule } from "./checks/checks.module"
import { DocumentsModule } from "./documents/documents.module";
import { StorageModule } from "./storage/storage.module";
import { HealthController } from "./health/health.controller";
import { PublicSubmissionsModule } from "./public-submissions/public-submissions.module";
import { IncidentsModule } from "./incidents/incidents.module";
import { TasksModule } from "./tasks/tasks.module";
import { UsersModule } from "./users/users.module";
import { RequestIntakesModule } from "./request-intakes/request-intakes.module";
import { TriageModule } from "./triage/triage.module";
import { AuditEventsModule } from "./audit-events/audit-events.module";
import { ChangesModule } from "./changes/changes.module"
import { RisksModule } from "./risks/risks.module"
import { IssuesModule } from "./issues/issues.module"
import { KnowledgeModule } from "./knowledge/knowledge.module"
import { SearchModule } from "./search/search.module"
import { CommentsModule } from "./comments/comments.module"
import { WorkPackagesModule } from "./work-packages/work-packages.module"
import { ContactsModule } from "./contacts/contacts.module"
import { ActivitiesModule } from "./activities/activities.module"
import { OpportunitiesModule } from "./opportunities/opportunities.module"
import { QuotesModule } from "./quotes/quotes.module"
import { CrmModule } from "./crm/crm.module"
import { CabinetsModule } from "./cabinets/cabinets.module"
import { MyWorkModule } from "./my-work/my-work.module"
import { OverviewModule } from "./overview/overview.module"
import { MaintenanceModule } from "./maintenance/maintenance.module"
import { ConnectionsModule } from "./connections/connections.module"
import { RecordLinksModule } from "./record-links/record-links.module"
import { AttachmentsModule } from "./attachments/attachments.module"
import { NotificationsModule } from "./notifications/notifications.module"
import { RecordReportModule } from "./records-report/record-report.module"
import { DeviceTypesModule } from "./device-types/device-types.module"
import { CapacityModule } from "./dcim/capacity.module"
import { PortsModule } from "./ports/ports.module"
import { WorkNotesModule } from "./work-notes/work-notes.module"
import { SensorReadingsModule } from "./sensor-readings/sensor-readings.module"
import { AssetCustomFieldsModule } from "./asset-custom-fields/asset-custom-fields.module"
import { MetricsModule } from "./metrics/metrics.module"
import { SharePointProvisioningModule } from "./sharepoint-provisioning/provisioning.module"
import { RecordWatchModule } from "./record-watch/watch.module"

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuthModule,
    OidcModule,
    ClientsModule,
    ServiceRequestsModule,
    AssetsModule,
    ChecksModule,
    DocumentsModule,
    PublicSubmissionsModule,
    RequestIntakesModule,
    TriageModule,
    AuditEventsModule,
    IncidentsModule,
    TasksModule,
    SitesModule,
    ChangesModule,
    RisksModule,
    IssuesModule,
    KnowledgeModule,
    SearchModule,
    CommentsModule,
    WorkPackagesModule,
    ContactsModule,
    ActivitiesModule,
    OpportunitiesModule,
    QuotesModule,
    CrmModule,
    MyWorkModule,
    CabinetsModule,
    OverviewModule,
    UsersModule,
    MaintenanceModule,
    ConnectionsModule,
    RecordLinksModule,
    AttachmentsModule,
    NotificationsModule,
    RecordReportModule,
    DeviceTypesModule,
    CapacityModule,
    PortsModule,
    WorkNotesModule,
    SensorReadingsModule,
    AssetCustomFieldsModule,
    MetricsModule,
    SharePointProvisioningModule,
    RecordWatchModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
