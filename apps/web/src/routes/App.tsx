import React, { useEffect } from "react"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { getToken } from "../lib/auth"
import { setAuthToken } from "../lib/api"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import LoginPage from "./LoginPage"
import Shell from "./Shell"
import DashboardPage from "./DashboardPage"
import ServiceDeskPage from "./ServiceDeskPage"
import ServiceRequestDetailPage from "./ServiceRequestDetailPage"
import TasksPage from "./TasksPage"
import TaskDetailPage from "./TaskDetailPage"
import RiskDetailPage from "./RiskDetailPage"
import IssueDetailPage from "./IssueDetailPage"
import ChangesPage from "./ChangesPage"
import ChangeDetailPage from "./ChangeDetailPage"
import IncidentsPage from "./IncidentsPage"
import IncidentDetailPage from "./IncidentDetailPage"
import AssetManagementPage from "./AssetManagementPage"
import SiteDetailPage from "./SiteDetailPage"
import RoomDetailPage from "./RoomDetailPage"
import ChecksPage from "./ChecksPage"
import CheckDetailPage from "./CheckDetailPage"
import CheckTemplatesPage from "./CheckTemplatesPage"
import CheckTemplateDetailPage from "./CheckTemplateDetailPage"
import WorkPackagesPage from "./WorkPackagesPage"
import AuditTrailPage from "./AuditTrailPage"
import UsersPage from "./UsersPage"
import ClientsPage from "./ClientsPage"
import MyWorkPage from "./MyWorkPage"
import OverviewPage from "./OverviewPage"
import DcimOverviewPage from "./DcimOverviewPage"
import MaintenancePage from "./MaintenancePage"
import MaintenanceDetailPage from "./MaintenanceDetailPage"
import ConnectionsPage from "./ConnectionsPage"
import ConnectionDetailPage from "./ConnectionDetailPage"
import RisksIssuesPage from "./RisksIssuesPage"

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
  return <Navigate to={id ? `/service-desk/${id}` : "/service-desk"} replace />
}

export default function App() {
  useEffect(() => setAuthToken(getToken()), [])

  return (
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

        {/* Service desk */}
        <Route path="service-desk" element={<ServiceDeskPage />} />
        <Route path="service-desk/:id" element={<ServiceRequestDetailPage />} />
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

        {/* Changes */}
        <Route path="changes" element={<ChangesPage />} />
        <Route path="changes/:id" element={<ChangeDetailPage />} />

        {/* Incidents */}
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="incidents/:id" element={<IncidentDetailPage />} />

        {/* Asset Management — unified explorer */}
        <Route path="asset-management" element={<AssetManagementPage />} />
        <Route path="asset-management/:siteId" element={<AssetManagementPage />} />
        <Route path="asset-management/:siteId/rooms/:roomId" element={<AssetManagementPage />} />
        <Route path="asset-management/:siteId/cabinets/:cabinetId" element={<AssetManagementPage />} />
        <Route path="asset-management/:siteId/assets/:assetId" element={<AssetManagementPage />} />
        {/* Legacy — rollback path */}
        <Route path="asset-management-legacy/:siteId" element={<SiteDetailPage />} />
        <Route path="asset-management-legacy/:siteId/rooms/:roomId" element={<RoomDetailPage />} />

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
            <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER]}>
              <UsersPage />
            </RequireRoles>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}