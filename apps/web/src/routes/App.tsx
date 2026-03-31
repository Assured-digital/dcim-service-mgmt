import React, { useEffect } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
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
import RisksIssuesPage from "./RisksIssuesPage"
import RiskDetailPage from "./RiskDetailPage"
import IssueDetailPage from "./IssueDetailPage"
import SitesPage from "./SitesPage"
import SiteDetailPage from "./SiteDetailPage"
import ChecksPage from "./ChecksPage"
import CheckDetailPage from "./CheckDetailPage"
import CheckTemplatesPage from "./CheckTemplatesPage"
import CheckTemplateDetailPage from "./CheckTemplateDetailPage"
import WorkPackagesPage from "./WorkPackagesPage"
import AssetsPage from "./AssetsPage"
import AuditTrailPage from "./AuditTrailPage"
import UsersPage from "./UsersPage"
import ClientsPage from "./ClientsPage"
import MyWorkPage from "./MyWorkPage"
import OverviewPage from "./OverviewPage"

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = getToken()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRoles({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  if (!hasAnyRole(roles)) return <Navigate to="/" replace />
  return <>{children}</>
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

        {/* Redirects for old routes */}
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
        <Route path="service-requests/:id" element={<ServiceRequestDetailPage />} />

        {/* Tasks */}
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:id" element={<TaskDetailPage />} />

        {/* Risks & Issues */}
        <Route path="risks" element={<RisksIssuesPage />} />
        <Route path="issues" element={<RisksIssuesPage />} />
        <Route path="risks/:id" element={<RiskDetailPage />} />
        <Route path="issues/:id" element={<IssueDetailPage />} />

        {/* Sites & surveys */}
        <Route path="sites" element={<SitesPage />} />
        <Route path="sites/:id" element={<SiteDetailPage />} />
        <Route path="checks" element={<ChecksPage />} />
        <Route path="checks/:id" element={<CheckDetailPage />} />
        <Route path="check-templates" element={<CheckTemplatesPage />} />
        <Route path="check-templates/:id" element={<CheckTemplateDetailPage />} />

        {/* Operations */}
        <Route path="work-packages" element={<WorkPackagesPage />} />
        <Route path="assets" element={<AssetsPage />} />

        {/* Admin */}
        <Route path="audit" element={<AuditTrailPage />} />
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