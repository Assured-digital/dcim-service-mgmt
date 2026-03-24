import React, { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "../lib/auth";
import { setAuthToken } from "../lib/api";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";
import LoginPage from "./LoginPage";
import Shell from "./Shell";
import DashboardPage from "./DashboardPage";
import TriagePage from "./TriagePage";
import RaiseRequestPage from "./RaiseRequestPage";
import ServiceRequestsPage from "./ServiceRequestsPage";
import IncidentsPage from "./IncidentsPage";
import TasksPage from "./TasksPage";
import AssetsPage from "./AssetsPage";
import SurveysPage from "./SurveysPage";
import SurveyDetailPage from "./SurveyDetailPage";
import AuditTrailPage from "./AuditTrailPage";
import UsersPage from "./UsersPage";
import ClientsPage from "./ClientsPage";
import SitesPage from "./SitesPage"
import ChangesPage from "./ChangesPage"
import RisksPage from "./RisksPage"
import IssuesPage from "./IssuesPage"
import WorkPackagesPage from "./WorkPackagesPage"
import ServiceRequestDetailPage from "./ServiceRequestDetailPage"
import ChangeDetailPage from "./ChangeDetailPage"
import RiskDetailPage from "./RiskDetailPage"
import IssueDetailPage from "./IssueDetailPage"
import ServiceDeskPage from "./ServiceDeskPage"
import TaskDetailPage from "./TaskDetailPage"
import SiteDetailPage from "./SiteDetailPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRoles({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  if (!hasAnyRole(roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  useEffect(() => setAuthToken(getToken()), []);

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
        <Route index element={<DashboardPage />} />
        <Route path="raise-request" element={<Navigate to="/service-desk" replace />} />
        <Route path="triage" element={<Navigate to="/service-desk" replace />} />
        <Route path="service-requests" element={<ServiceRequestsPage />} />
        <Route path="service-requests/:id" element={<ServiceRequestDetailPage />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:id" element={<TaskDetailPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="surveys" element={<SurveysPage />} />
        <Route path="audit" element={<AuditTrailPage />} />
        <Route path="surveys/:id" element={<SurveyDetailPage />} />
        <Route path="sites" element={<SitesPage />} />
        <Route path="sites/:id" element={<SiteDetailPage />} />
        <Route path="changes" element={<ChangesPage />} />
        <Route path="changes/:id" element={<ChangeDetailPage />} />
        <Route path="risks" element={<RisksPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="work-packages" element={<WorkPackagesPage />} />
        <Route path="risks/:id" element={<RiskDetailPage />} />
        <Route path="issues/:id" element={<IssueDetailPage />} />
        <Route path="service-desk" element={<ServiceDeskPage />} />
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
  );
}
