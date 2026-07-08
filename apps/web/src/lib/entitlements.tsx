import { Box, Typography } from "@mui/material"
import BlockIcon from "@mui/icons-material/Block"
import { useQuery } from "@tanstack/react-query"
import { getCurrentUser, isOrgSuperRole } from "./auth"
import { getSelectedClientId } from "./scope"
import { listClients, listMyClients } from "./clients"

// A2 — Feature entitlement (frontend). The licensable product modules; must match
// the API PlatformModule enum. Platform primitives (dashboard, admin, client
// selector) are always on and are NOT modules.
export type PlatformModuleKey = "SERVICE_DESK" | "DCIM" | "CRM" | "OPERATIONS"

export const PLATFORM_MODULES: { key: PlatformModuleKey; label: string; description: string }[] = [
  { key: "SERVICE_DESK", label: "Service Desk", description: "Incidents, requests, changes, tasks, risks & issues" },
  { key: "DCIM", label: "DC Manager (DCIM)", description: "Assets, capacity, rack views, floor plans" },
  { key: "CRM", label: "CRM", description: "Pipeline, contacts, quotes & activities" },
  { key: "OPERATIONS", label: "Operations", description: "Field-work checks & templates" }
]

// Path-prefix → module map, for the single Shell-level route guard. Keep in sync
// with the module routes in App.tsx.
const MODULE_ROUTE_PREFIXES: { module: PlatformModuleKey; prefixes: string[] }[] = [
  { module: "SERVICE_DESK", prefixes: ["/service-desk", "/knowledge", "/risks-issues", "/incidents", "/changes", "/tasks", "/service-requests"] },
  { module: "CRM", prefixes: ["/crm"] },
  { module: "DCIM", prefixes: ["/dcim", "/asset-hierarchy", "/asset-register", "/asset-management", "/connections", "/maintenance", "/pending-deletions"] },
  { module: "OPERATIONS", prefixes: ["/checks", "/check-templates"] }
]

// Which module (if any) a path belongs to. Platform pages (dashboard, admin,
// my-work, settings) map to no module and are never gated.
export function moduleForPath(pathname: string): PlatformModuleKey | null {
  for (const { module, prefixes } of MODULE_ROUTE_PREFIXES) {
    if (prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))) return module
  }
  return null
}

// Reads the scoped client's licensed module set. `enabledModules === null` means
// unknown (no client selected / still loading) → callers treat everything as
// visible, so the nav never flickers or hides during load.
export function useClientEntitlements(): {
  enabledModules: string[] | null
  hasModule: (m: PlatformModuleKey) => boolean
} {
  const user = getCurrentUser()
  const isOrgSuper = isOrgSuperRole(user?.role)
  const selectedId = getSelectedClientId() ?? ""

  const orgClients = useQuery({ queryKey: ["clients"], enabled: isOrgSuper, queryFn: listClients })
  const myClients = useQuery({ queryKey: ["clients-mine"], enabled: !isOrgSuper, queryFn: listMyClients })

  const list = (isOrgSuper ? orgClients.data : myClients.data) ?? []
  const client = list.find((c) => c.id === selectedId)
  const enabledModules = client?.enabledModules ?? null

  return {
    enabledModules,
    hasModule: (m) => (enabledModules ? enabledModules.includes(m) : true)
  }
}

// Shown in place of a page when the scoped client isn't licensed for its module
// (the API also 403s — this is the friendly UX layer).
export function ModuleDisabledNotice({ module }: { module: PlatformModuleKey }) {
  const label = PLATFORM_MODULES.find((m) => m.key === module)?.label ?? module
  return (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
      <Box sx={{ maxWidth: 420, textAlign: "center" }}>
        <BlockIcon sx={{ fontSize: 40, color: "var(--color-text-muted)", mb: 1.5 }} />
        <Typography sx={{ fontSize: 16, fontWeight: 600, mb: 0.5 }}>
          {label} isn’t enabled for this client
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: "var(--color-text-muted)" }}>
          This client isn’t licensed for the {label} module. An administrator can enable it from
          Clients → edit → Module access.
        </Typography>
      </Box>
    </Box>
  )
}
