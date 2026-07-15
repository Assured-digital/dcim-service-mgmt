import React, { useEffect, Suspense } from "react"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { getToken } from "../lib/auth"
import { setAuthToken } from "../lib/api"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { LoadingState } from "../components/PageState"
import PageTitle from "../components/PageTitle"
import Shell from "./Shell"

const LoginPage                = React.lazy(() => import("./LoginPage"))
const AuthCallbackPage         = React.lazy(() => import("./AuthCallbackPage"))
const DashboardPage            = React.lazy(() => import("./DashboardPage"))
const ServiceDeskNavigator     = React.lazy(() => import("./ServiceDeskNavigator"))
const AssetHierarchyPage       = React.lazy(() => import("./AssetHierarchyPage"))
const AssetRegisterPage        = React.lazy(() => import("./AssetRegisterPage"))
const ChecksPage               = React.lazy(() => import("./ChecksPage"))
const CheckHistoryPage         = React.lazy(() => import("./CheckHistoryPage"))
const CheckDetailPage          = React.lazy(() => import("./CheckDetailPage"))
const CheckTemplatesPage       = React.lazy(() => import("./CheckTemplatesPage"))
const CheckTemplateDetailPage  = React.lazy(() => import("./CheckTemplateDetailPage"))
const WorkPackagesPage         = React.lazy(() => import("./WorkPackagesPage"))
const WorkPackageDetailPage    = React.lazy(() => import("./WorkPackageDetailPage"))
const CrmOverviewPage          = React.lazy(() => import("./CrmOverviewPage"))
const CrmContactsPage          = React.lazy(() => import("./CrmContactsPage"))
const CrmActivityPage          = React.lazy(() => import("./CrmActivityPage"))
const CrmPipelinePage          = React.lazy(() => import("./CrmPipelinePage"))
const CrmOpportunityDetailPage = React.lazy(() => import("./CrmOpportunityDetailPage"))
const CrmQuotesPage            = React.lazy(() => import("./CrmQuotesPage"))
const CrmQuoteDetailPage       = React.lazy(() => import("./CrmQuoteDetailPage"))
const CrmDocumentsPage         = React.lazy(() => import("./CrmDocumentsPage"))
const CrmReportsPage           = React.lazy(() => import("./CrmReportsPage"))
const CrmTriagePage            = React.lazy(() => import("./CrmTriagePage"))
const PendingDeletionsPage     = React.lazy(() => import("./PendingDeletionsPage").then(m => ({ default: m.PendingDeletionsPage })))
const AuditTrailPage           = React.lazy(() => import("./AuditTrailPage"))
const UsersPage                = React.lazy(() => import("./UsersPage"))
const AdminUsersPage           = React.lazy(() => import("./AdminUsersPage"))
const ClientsPage              = React.lazy(() => import("./ClientsPage"))
const KnowledgePage            = React.lazy(() => import("./KnowledgePage"))
const MyWorkPage               = React.lazy(() => import("./MyWorkPage"))
const ReportingPage            = React.lazy(() => import("./ReportingPage"))
const OverviewPage             = React.lazy(() => import("./OverviewPage"))
const DcimOverviewPage         = React.lazy(() => import("./DcimOverviewPage"))
const PlaceEquipmentPage       = React.lazy(() => import("./PlaceEquipmentPage"))
const MonitoringPage           = React.lazy(() => import("./MonitoringPage"))
const DeviceCataloguePage      = React.lazy(() => import("./DeviceCataloguePage"))
const FloorPlanPage            = React.lazy(() => import("./FloorPlanPage"))
const InfrastructureReportPage = React.lazy(() => import("./InfrastructureReportPage"))
const MaintenancePage          = React.lazy(() => import("./MaintenancePage"))
const MaintenanceDetailPage    = React.lazy(() => import("./MaintenanceDetailPage"))
const ConnectionsPage          = React.lazy(() => import("./ConnectionsPage"))
const ConnectionDetailPage     = React.lazy(() => import("./ConnectionDetailPage"))
const SettingsPage             = React.lazy(() => import("./SettingsPage"))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = getToken()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRoles({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  if (!hasAnyRole(roles)) return <Navigate to="/" replace />
  return <>{children}</>
}

function LegacyRiskDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/service-desk/risk/${id}` : "/service-desk"} replace />
}

function LegacyIssueDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/service-desk/issue/${id}` : "/service-desk"} replace />
}

// Risks & Issues have been merged into Service Desk (one queue). The retired
// /risks-issues subtree redirects: records map to their Service Desk detail URL,
// the list (and anything else) to the unified queue.
function RisksIssuesRedirect() {
  const params = useParams()
  const [type, id] = (params["*"] ?? "").split("/").filter(Boolean)
  if (type === "risks" && id) return <Navigate to={`/service-desk/risk/${id}`} replace />
  if (type === "issues" && id) return <Navigate to={`/service-desk/issue/${id}`} replace />
  return <Navigate to="/service-desk" replace />
}

function LegacyServiceRequestDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/service-desk/sr/${id}` : "/service-desk"} replace />
}

function LegacyIncidentDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/service-desk/inc/${id}` : "/service-desk"} replace />
}

function LegacyChangeDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/service-desk/chg/${id}` : "/service-desk"} replace />
}

function LegacyTaskDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/service-desk/task/${id}` : "/service-desk"} replace />
}


function LegacyHierarchySiteRedirect() {
  const { siteId } = useParams()
  return <Navigate to={`/asset-hierarchy/${siteId}`} replace />
}

function LegacyHierarchyRoomRedirect() {
  const { siteId, roomId } = useParams()
  return <Navigate to={`/asset-hierarchy/${siteId}/rooms/${roomId}`} replace />
}

function LegacyHierarchyCabinetRedirect() {
  const { siteId, cabinetId } = useParams()
  return <Navigate to={`/asset-hierarchy/${siteId}/cabinets/${cabinetId}`} replace />
}

function LegacyHierarchyAssetRedirect() {
  const { siteId, assetId } = useParams()
  return <Navigate to={`/asset-hierarchy/${siteId}/assets/${assetId}`} replace />
}

function LegacyRegisterAssetRedirect() {
  const { assetId } = useParams()
  return <Navigate to={`/asset-register/assets/${assetId}`} replace />
}

export default function App() {
  useEffect(() => setAuthToken(getToken()), [])

  return (
    <Suspense fallback={<LoadingState />}>
      {/* Drives the tab title from the route; mounted before <Routes> so a record
          detail page's title effect (deeper in the tree) runs after and wins. */}
      <PageTitle />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
          <Route index element={<MyWorkPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="reporting" element={<ReportingPage />} />
          <Route path="dcim/overview" element={<DcimOverviewPage />} />
          <Route path="dcim/place" element={<PlaceEquipmentPage />} />
          <Route path="dcim/monitoring" element={<MonitoringPage />} />
          <Route path="dcim/catalogue" element={<DeviceCataloguePage />} />
          <Route path="dcim/floor-plan" element={<FloorPlanPage />} />
          <Route path="dcim/report" element={<InfrastructureReportPage />} />

          {/* Legacy redirects */}
          <Route path="raise-request" element={<Navigate to="/service-desk" replace />} />
          <Route path="triage" element={<Navigate to="/service-desk" replace />} />
          <Route path="service-requests" element={<Navigate to="/service-desk" replace />} />

          {/* My Work and Overview */}
          <Route path="my-work" element={<MyWorkPage />} />
          <Route
            path="overview"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER]}>
                <OverviewPage />
              </RequireRoles>
            }
          />

          {/* Account settings */}
          <Route path="settings" element={<SettingsPage />} />

          {/* Service desk — unified surface. The drill-down navigator owns the
              whole /service-desk/* subtree (queue → record → association), driven
              entirely by the URL. More-specific siblings below still win by RR v6
              route ranking (static/dynamic outrank the splat). */}
          <Route
            path="service-desk/*"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <ServiceDeskNavigator />
              </RequireRoles>
            }
          />
          {/* Service Management dashboard removed (#160) — it overlapped the main
              Dashboard. Old deep links fall back to the Service Desk queue. */}
          <Route path="service-management/dashboard" element={<Navigate to="/service-desk" replace />} />
          <Route path="service-desk/dashboard" element={<Navigate to="/service-desk" replace />} />
          {/* Legacy redirects */}
          <Route path="service-desk/:id" element={<LegacyServiceRequestDetailRedirect />} />
          <Route path="service-requests/:id" element={<LegacyServiceRequestDetailRedirect />} />

          {/* Tasks — now unified under Service Desk (Task is a first-class ticket type) */}
          <Route path="tasks" element={<Navigate to="/service-desk?type=task" replace />} />
          <Route path="tasks/:id" element={<LegacyTaskDetailRedirect />} />

          {/* Risks & Issues — the drill-down navigator owns the whole
              /risks-issues/* subtree (list → record → association), driven entirely
              by the URL (mirrors /service-desk/*). More-specific siblings below still
              win by RR v6 route ranking (static/dynamic outrank the splat). */}
          <Route path="risks-issues/*" element={<RisksIssuesRedirect />} />
          {/* Legacy risk/issue redirects → Service Desk (R&I merged in) */}
          <Route path="risks" element={<Navigate to="/service-desk" replace />} />
          <Route path="issues" element={<Navigate to="/service-desk" replace />} />
          <Route path="risks/:id" element={<LegacyRiskDetailRedirect />} />
          <Route path="issues/:id" element={<LegacyIssueDetailRedirect />} />

          {/* Changes — now unified under Service Desk */}
          <Route path="changes" element={<Navigate to="/service-desk?view=table" replace />} />
          <Route path="changes/:id" element={<LegacyChangeDetailRedirect />} />

          {/* Incidents — now unified under Service Desk */}
          <Route path="incidents" element={<Navigate to="/service-desk?view=table" replace />} />
          <Route path="incidents/:id" element={<LegacyIncidentDetailRedirect />} />

          {/* Knowledge base — a Service Desk capability */}
          <Route
            path="knowledge"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER]}>
                <KnowledgePage />
              </RequireRoles>
            }
          />

          {/* Asset Hierarchy and Register */}
          <Route path="asset-hierarchy" element={<AssetHierarchyPage />} />
          <Route path="asset-hierarchy/:siteId" element={<AssetHierarchyPage />} />
          <Route path="asset-hierarchy/:siteId/rooms/:roomId" element={<AssetHierarchyPage />} />
          <Route path="asset-hierarchy/:siteId/cabinets/:cabinetId" element={<AssetHierarchyPage />} />
          <Route path="asset-hierarchy/:siteId/assets/:assetId" element={<AssetHierarchyPage />} />
          <Route path="asset-register" element={<AssetRegisterPage />} />
          <Route path="asset-register/assets/:assetId" element={<AssetRegisterPage />} />
          {/* Legacy redirects from /asset-management/* */}
          <Route path="asset-management" element={<Navigate to="/asset-hierarchy" replace />} />
          <Route path="asset-management/hierarchy" element={<Navigate to="/asset-hierarchy" replace />} />
          <Route path="asset-management/hierarchy/:siteId" element={<LegacyHierarchySiteRedirect />} />
          <Route path="asset-management/hierarchy/:siteId/rooms/:roomId" element={<LegacyHierarchyRoomRedirect />} />
          <Route path="asset-management/hierarchy/:siteId/cabinets/:cabinetId" element={<LegacyHierarchyCabinetRedirect />} />
          <Route path="asset-management/hierarchy/:siteId/assets/:assetId" element={<LegacyHierarchyAssetRedirect />} />
          <Route path="asset-management/register" element={<Navigate to="/asset-register" replace />} />
          <Route path="asset-management/register/assets/:assetId" element={<LegacyRegisterAssetRedirect />} />
          <Route path="asset-management/:siteId" element={<LegacyHierarchySiteRedirect />} />
          <Route path="asset-management/:siteId/rooms/:roomId" element={<LegacyHierarchyRoomRedirect />} />
          <Route path="asset-management/:siteId/cabinets/:cabinetId" element={<LegacyHierarchyCabinetRedirect />} />
          <Route path="asset-management/:siteId/assets/:assetId" element={<LegacyHierarchyAssetRedirect />} />

          {/* DCIM — Maintenance & Connections */}
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="maintenance/:id" element={<MaintenanceDetailPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="connections/:id" element={<ConnectionDetailPage />} />

          {/* Field Work — Engineering Checks */}
          <Route path="checks" element={<ChecksPage />} />
          <Route path="checks/history" element={<CheckHistoryPage />} />
          <Route path="checks/:id/*" element={<CheckDetailPage />} />
          <Route path="check-templates" element={<CheckTemplatesPage />} />
          <Route path="check-templates/:id" element={<CheckTemplateDetailPage />} />

          {/* Service Scope */}
          <Route
            path="work-packages"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST]}>
                <WorkPackagesPage />
              </RequireRoles>
            }
          />
          <Route
            path="work-packages/:id"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <WorkPackageDetailPage />
              </RequireRoles>
            }
          />

          {/* CRM (CRM_DESIGN.md §7) — AD-staff only, never CLIENT_VIEWER */}
          <Route
            path="crm"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmOverviewPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/contacts"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmContactsPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/activity"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmActivityPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/pipeline"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmPipelinePage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/opportunities/:id"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmOpportunityDetailPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/quotes"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmQuotesPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/quotes/:id"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmQuoteDetailPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/documents"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]}>
                <CrmDocumentsPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/reports"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER]}>
                <CrmReportsPage />
              </RequireRoles>
            }
          />
          <Route
            path="crm/triage"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES]}>
                <CrmTriagePage />
              </RequireRoles>
            }
          />

          {/* Asset deletion approvals — approver queue (ORG-super + SERVICE_MANAGER) */}
          <Route
            path="pending-deletions"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER]}>
                <PendingDeletionsPage />
              </RequireRoles>
            }
          />

          {/* Admin */}
          {/* Audit: explicit live-admin roles (excludes deprecated ADMIN) to match the API gate */}
          <Route
            path="audit"
            element={
              <RequireRoles roles={[ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.SERVICE_MANAGER]}>
                <AuditTrailPage />
              </RequireRoles>
            }
          />
          <Route
            path="clients"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES]}>
                <ClientsPage />
              </RequireRoles>
            }
          />
          <Route
            path="users"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES]}>
                <UsersPage />
              </RequireRoles>
            }
          />
          {/* Top Admin → Users: Assured Digital staff, org-wide */}
          <Route
            path="admin/users"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES]}>
                <AdminUsersPage />
              </RequireRoles>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
