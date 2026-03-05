import React, { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "../lib/auth";
import { setAuthToken } from "../lib/api";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";
import LoginPage from "./LoginPage";
import Shell from "./Shell";
import DashboardPage from "./DashboardPage";
import TriagePage from "./TriagePage";
import ServiceRequestsPage from "./ServiceRequestsPage";
import IncidentsPage from "./IncidentsPage";
import TasksPage from "./TasksPage";
import AssetsPage from "./AssetsPage";
import SurveysPage from "./SurveysPage";
import SurveyDetailPage from "./SurveyDetailPage";
import UsersPage from "./UsersPage";
import ClientsPage from "./ClientsPage";
import OrganizationPage from "./OrganizationPage";

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
        <Route
          path="triage"
          element={
            <RequireRoles roles={[...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST]}>
              <TriagePage />
            </RequireRoles>
          }
        />
        <Route path="service-requests" element={<ServiceRequestsPage />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="surveys" element={<SurveysPage />} />
        <Route path="surveys/:id" element={<SurveyDetailPage />} />
        <Route
          path="organization"
          element={
            <RequireRoles roles={[...ORG_SUPER_ROLES]}>
              <OrganizationPage />
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
  );
}
