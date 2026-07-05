import { Injectable, Logger } from "@nestjs/common"
import { DefaultAzureCredential } from "@azure/identity"

// Microsoft Graph — APP-ONLY access (CRM_DESIGN.md §8 / Phase 7a, app-only
// variant). Authenticates with the container app's managed identity via
// DefaultAzureCredential — the SAME credential the storage provider uses, so
// AZURE_CLIENT_ID must be set (deploy gotcha #5). The identity needs the
// Sites.Read.All + Files.Read.All APPLICATION permissions granted with admin
// consent. NB (deliberate deviation from design §8 delegated-auth, carded):
// app-only means SharePoint does NOT enforce per-user file permissions —
// access is gated by our AD-staff RBAC at the API. Consistent with the rule
// "SharePoint permissions are never the tenant boundary"; CRM docs are
// AD-staff-only regardless.
//
// Env-gated: inert until GRAPH_ENABLED=true and SHAREPOINT_SITE_ID are set, so
// deploying this code changes nothing until the flag is flipped (gotcha #6).
// Uses global fetch (Node 20) — no Graph SDK dependency, no container rebuild.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const GRAPH_SCOPE = "https://graph.microsoft.com/.default"

export type DriveItem = {
  id: string
  name: string
  webUrl: string
  size?: number
  lastModifiedDateTime?: string
  isFolder: boolean
  childCount?: number
  mimeType?: string
}

@Injectable()
export class MsGraphService {
  private readonly logger = new Logger(MsGraphService.name)
  private credential = new DefaultAzureCredential()
  private driveIdCache?: string
  private token?: { value: string; expiresOnTimestamp: number }

  isConfigured(): boolean {
    return process.env.GRAPH_ENABLED === "true" && !!process.env.SHAREPOINT_SITE_ID
  }

  private async getToken(): Promise<string> {
    // Reuse until ~2 min before expiry.
    if (this.token && this.token.expiresOnTimestamp - Date.now() > 120_000) return this.token.value
    const t = await this.credential.getToken(GRAPH_SCOPE)
    if (!t) throw new Error("Failed to acquire a Microsoft Graph token")
    this.token = { value: t.token, expiresOnTimestamp: t.expiresOnTimestamp }
    return t.token
  }

  private async graphGet<T>(path: string): Promise<T> {
    const token = await this.getToken()
    const res = await fetch(`${GRAPH_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      this.logger.warn(`Graph GET ${path} → ${res.status}: ${body.slice(0, 300)}`)
      throw new Error(`Graph request failed (${res.status})`)
    }
    return (await res.json()) as T
  }

  // The default document library drive for the configured site (memoised).
  private async getDriveId(): Promise<string> {
    if (this.driveIdCache) return this.driveIdCache
    const siteId = process.env.SHAREPOINT_SITE_ID!
    const drive = await this.graphGet<{ id: string }>(`/sites/${encodeURIComponent(siteId)}/drive`)
    this.driveIdCache = drive.id
    return drive.id
  }

  private mapItem(v: any): DriveItem {
    return {
      id: v.id,
      name: v.name,
      webUrl: v.webUrl,
      size: v.size,
      lastModifiedDateTime: v.lastModifiedDateTime,
      isFolder: !!v.folder,
      childCount: v.folder?.childCount,
      mimeType: v.file?.mimeType
    }
  }

  // List the children of a folder path (relative to the drive root). An empty
  // path lists the client folder itself; callers prefix the client's
  // sharePointFolderPath. Path segments are URL-encoded.
  async listChildren(folderPath: string): Promise<DriveItem[]> {
    const driveId = await this.getDriveId()
    const clean = folderPath.replace(/^\/+|\/+$/g, "")
    const loc = clean
      ? `/drives/${driveId}/root:/${clean.split("/").map(encodeURIComponent).join("/")}:/children`
      : `/drives/${driveId}/root/children`
    const data = await this.graphGet<{ value: any[] }>(`${loc}?$top=200&$orderby=name`)
    return data.value.map(v => this.mapItem(v))
  }

  // Search within a client folder subtree. Resolves the folder item, then runs
  // Graph's driveItem search scoped to it.
  async searchInFolder(folderPath: string, query: string): Promise<DriveItem[]> {
    const driveId = await this.getDriveId()
    const clean = folderPath.replace(/^\/+|\/+$/g, "")
    const folder = await this.graphGet<{ id: string }>(
      `/drives/${driveId}/root:/${clean.split("/").map(encodeURIComponent).join("/")}`
    )
    const data = await this.graphGet<{ value: any[] }>(
      `/drives/${driveId}/items/${folder.id}/search(q='${encodeURIComponent(query.replace(/'/g, "''"))}')?$top=100`
    )
    return data.value.map(v => this.mapItem(v))
  }
}
