import React, { useEffect, Suspense } from "react"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { getToken } from "../lib/auth"
import { setAuthToken } from "../lib/api"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { LoadingState } from "../components/PageState"
import PageTitle from "../components/PageTitle"
import Shell from "./Shell"

const LoginPage                = React.lazy(() => import("./LoginPage"))
const DashboardPage            = React.lazy(() => import("./DashboardPage"))
const ServiceDeskNavigator     = React.lazy(() => import("./ServiceDeskNavigator"))
const ServiceDeskDashboard     = React.lazy(() => import("./ServiceDeskDashboard"))
const TasksPage                = React.lazy(() => import("./TasksPage"))
const TaskDetailPage           = React.lazy(() => import("./TaskDetailPage"))
const RiskDetailPage           = React.lazy(() => import("./RiskDetailPage"))
const IssueDetailPage          = React.lazy(() => import("./IssueDetailPage"))
const AssetHierarchyPage       = React.lazy(() => import("./AssetHierarchyPage"))
const AssetRegisterPage        = React.lazy(() => import("./AssetRegisterPage"))
const ChecksPage               = React.lazy(() => import("./ChecksPage"))
const CheckDetailPage          = React.lazy(() => import("./CheckDetailPage"))
const CheckTemplatesPage       = React.lazy(() => import("./CheckTemplatesPage"))
const CheckTemplateDetailPage  = React.lazy(() => import("./CheckTemplateDetailPage"))
const WorkPackagesPage         = React.lazy(() => import("./WorkPackagesPage"))
const AuditTrailPage           = React.lazy(() => import("./AuditTrailPage"))
const UsersPage                = React.lazy(() => import("./UsersPage"))
const AdminUsersPage           = React.lazy(() => import("./AdminUsersPage"))
const ClientsPage              = React.lazy(() => import("./ClientsPage"))
const MyWorkPage               = React.lazy(() => import("./MyWorkPage"))
const OverviewPage             = React.lazy(() => import("./OverviewPage"))
const DcimOverviewPage         = React.lazy(() => import("./DcimOverviewPage"))
const MaintenancePage          = React.lazy(() => import("./MaintenancePage"))
const MaintenanceDetailPage    = React.lazy(() => import("./MaintenanceDetailPage"))
const ConnectionsPage          = React.lazy(() => import("./ConnectionsPage"))
const ConnectionDetailPage     = React.lazy(() => import("./ConnectionDetailPage"))
const RisksIssuesPage          = React.lazy(() => import("./RisksIssuesPage"))

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
  return <Navigate to={id ? `/risks-issues/risks/${id}` : "/risks-issues"} replace />
}

function LegacyIssueDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/risks-issues/issues/${id}` : "/risks-issues"} replace />
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
          <Route path="dcim/overview" element={<DcimOverviewPage />} />

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

          {/* Service desk — unified surface. The drill-down navigator owns the
              whole /service-desk/* subtree (queue → record → association), driven
              entirely by the URL. More-specific siblings below still win by RR v6
              route ranking (static/dynamic outrank the splat). */}
          <Route path="service-desk/*" element={<ServiceDeskNavigator />} />
          {/* Dashboard is its own Service Management nav item — kept off /service-desk
              so the Service Desk nav doesn't also highlight when the Dashboard is open. */}
          <Route path="service-management/dashboard" element={<ServiceDeskDashboard />} />
          {/* Legacy redirect for any deep links that still use the old path. */}
          <Route path="service-desk/dashboard" element={<Navigate to="/service-management/dashboard" replace />} />
          {/* Legacy redirects */}
          <Route path="service-desk/:id" element={<LegacyServiceRequestDetailRedirect />} />
          <Route path="service-requests/:id" element={<LegacyServiceRequestDetailRedirect />} />

          {/* Tasks */}
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />

          {/* Risks & Issues — single unified page */}
          <Route path="risks-issues" element={<RisksIssuesPage />} />
          <Route path="risks-issues/risks/:id" element={<RiskDetailPage />} />
          <Route path="risks-issues/issues/:id" element={<IssueDetailPage />} />
          {/* Legacy risk/issue redirects */}
          <Route path="risks" element={<Navigate to="/risks-issues" replace />} />
          <Route path="issues" element={<Navigate to="/risks-issues" replace />} />
          <Route path="risks/:id" element={<LegacyRiskDetailRedirect />} />
          <Route path="issues/:id" element={<LegacyIssueDetailRedirect />} />

          {/* Changes — now unified under Service Desk */}
          <Route path="changes" element={<Navigate to="/service-desk?view=table" replace />} />
          <Route path="changes/:id" element={<LegacyChangeDetailRedirect />} />

          {/* Incidents — now unified under Service Desk */}
          <Route path="incidents" element={<Navigate to="/service-desk?view=table" replace />} />
          <Route path="incidents/:id" element={<LegacyIncidentDetailRedirect />} />

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
          <Route path="checks/:id" element={<CheckDetailPage />} />
          <Route path="check-templates" element={<CheckTemplatesPage />} />
          <Route path="check-templates/:id" element={<CheckTemplateDetailPage />} />

          {/* Service Scope */}
          <Route path="work-packages" element={<WorkPackagesPage />} />

          {/* Admin */}
          <Route
            path="audit"
            element={
              <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER]}>
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
