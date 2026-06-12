import { useLocation } from "react-router-dom"
import { usePageTitle } from "../lib/usePageTitle"

// Maps URL prefixes to tab titles, built from the real routes in App.tsx.
// Record detail pages set their own title (e.g. INC-2026-6620) via
// RecordDetailShell, which wins over the prefix match below.
const TITLE_MAP: { prefix: string; title: string }[] = [
  { prefix: "/login", title: "Login" },
  { prefix: "/my-work", title: "My Work" },
  { prefix: "/dashboard", title: "Dashboard" },
  { prefix: "/overview", title: "Overview" },
  { prefix: "/dcim/overview", title: "DCIM Overview" },
  { prefix: "/service-management/dashboard", title: "Service Desk Dashboard" },
  { prefix: "/service-desk", title: "Service Desk" },
  { prefix: "/risks-issues", title: "Risks & Issues" },
  { prefix: "/incidents", title: "Incidents" },
  { prefix: "/changes", title: "Changes" },
  { prefix: "/tasks", title: "Tasks" },
  { prefix: "/asset-hierarchy", title: "Asset Hierarchy" },
  { prefix: "/asset-register", title: "Asset Register" },
  { prefix: "/maintenance", title: "Maintenance" },
  { prefix: "/connections", title: "Connections" },
  { prefix: "/check-templates", title: "Check Templates" },
  { prefix: "/checks", title: "Field Work" },
  { prefix: "/work-packages", title: "Service Scope" },
  { prefix: "/audit", title: "Audit Trail" },
  { prefix: "/clients", title: "Clients" },
  { prefix: "/users", title: "Users" },
  { prefix: "/settings", title: "Settings" },
  // Longest prefix wins so e.g. /service-management/dashboard beats /service-desk.
].sort((a, b) => b.prefix.length - a.prefix.length)

function titleForPath(pathname: string): string | undefined {
  if (pathname === "/") return "My Work"
  const match = TITLE_MAP.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  )
  return match?.title
}

/**
 * Drives the browser tab title from the current route. Mount once where the
 * routes render. Record detail pages override this with their record ref.
 */
export default function PageTitle() {
  const { pathname } = useLocation()
  usePageTitle(titleForPath(pathname))
  return null
}
