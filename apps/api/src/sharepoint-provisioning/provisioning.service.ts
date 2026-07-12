import { Injectable, Logger } from "@nestjs/common"
import { DefaultAzureCredential } from "@azure/identity"
import { PrismaService } from "../prisma/prisma.service"

// SharePoint site auto-provisioner (C1, model B). Runs ONLY inside the isolated
// provisioning job — where DefaultAzureCredential resolves the ELEVATED provisioner
// identity (Sites.FullControl.All on Graph + SharePoint). It never runs from the
// always-on API (the API's identity is Sites.Selected and would be rejected here),
// so the elevated capability is quarantined. Gated by SP_PROVISION_ENABLED.
//
// Per client it: creates a group-less communication site, adds the Evidence library,
// grants the RUNTIME app Sites.Selected (write), and stamps Client.sharePointSiteId.
// Idempotent — clients that already have a site id are skipped.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const GRAPH_SCOPE = "https://graph.microsoft.com/.default"

@Injectable()
export class SharePointProvisioningService {
  private readonly logger = new Logger(SharePointProvisioningService.name)
  private credential = new DefaultAzureCredential()

  constructor(private prisma: PrismaService) {}

  enabled(): boolean {
    return process.env.SP_PROVISION_ENABLED === "true"
  }

  private tenantRoot(): string {
    const host = process.env.SHAREPOINT_TENANT_HOST // e.g. assureddigitalservices.sharepoint.com
    if (!host) throw new Error("SHAREPOINT_TENANT_HOST not set")
    return `https://${host}`
  }

  private async token(scope: string): Promise<string> {
    const t = await this.credential.getToken(scope)
    if (!t) throw new Error(`Failed to acquire token for ${scope}`)
    return t.token
  }

  private async graph<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.token(GRAPH_SCOPE)
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!res.ok) {
      const b = await res.text().catch(() => "")
      throw new Error(`Graph ${method} ${path} → ${res.status}: ${b.slice(0, 300)}`)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  // Sweep every client missing a SharePoint site and provision it. The job entry
  // point calls this; a failure on one client is logged and retried next sweep.
  async sweep(): Promise<{ provisioned: number; skipped: number; failed: number }> {
    const clients = await this.prisma.client.findMany({
      where: { sharePointSiteId: null, status: { not: "INACTIVE" } },
      select: { id: true, name: true }
    })
    let provisioned = 0, skipped = 0, failed = 0
    for (const c of clients) {
      try {
        const r = await this.provisionClient(c.id)
        r.status === "provisioned" ? provisioned++ : skipped++
      } catch (e) {
        failed++
        this.logger.error(`Provisioning failed for client ${c.name} (${c.id}): ${(e as Error).message}`)
      }
    }
    this.logger.log(`SharePoint provisioning sweep: ${JSON.stringify({ provisioned, skipped, failed })}`)
    return { provisioned, skipped, failed }
  }

  async provisionClient(clientId: string): Promise<{ status: string; siteId?: string }> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, sharePointSiteId: true }
    })
    if (!client) return { status: "not_found" }
    if (client.sharePointSiteId) return { status: "already_provisioned", siteId: client.sharePointSiteId }

    const siteUrl = await this.createCommunicationSite(client.name, this.aliasFor(client.name, client.id))
    const siteId = await this.resolveSiteId(siteUrl)
    await this.ensureLibrary(siteId, "Evidence")
    await this.grantRuntimeApp(siteId)
    await this.prisma.client.update({ where: { id: client.id }, data: { sharePointSiteId: siteId } })
    this.logger.log(`Provisioned SharePoint site for client "${client.name}": ${siteId}`)
    return { status: "provisioned", siteId }
  }

  // ── SharePoint / Graph plumbing ────────────────────────────────────────────
  private aliasFor(name: string, id: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client"
    return `adsm-${base}-${id.slice(0, 6)}`
  }

  // Group-less modern communication site via SPSiteManager. App-only creation
  // requires an Owner (SP_PROVISION_OWNER_UPN). 409 = already exists (idempotent).
  private async createCommunicationSite(title: string, alias: string): Promise<string> {
    const root = this.tenantRoot()
    const url = `${root}/sites/${alias}`
    const owner = process.env.SP_PROVISION_OWNER_UPN
    if (!owner) throw new Error("SP_PROVISION_OWNER_UPN not set")
    const token = await this.token(`${root}/.default`)
    const res = await fetch(`${root}/_api/SPSiteManager/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json;odata=verbose",
        Accept: "application/json;odata=verbose"
      },
      body: JSON.stringify({
        request: {
          Title: `ADSM — ${title}`,
          Url: url,
          Lcid: 1033,
          ShareByEmailEnabled: true,
          WebTemplate: "SITEPAGEPUBLISHING#0", // communication site (no M365 group)
          Owner: owner
        }
      })
    })
    if (!res.ok && res.status !== 409) {
      const b = await res.text().catch(() => "")
      throw new Error(`SPSiteManager create ${url} → ${res.status}: ${b.slice(0, 300)}`)
    }
    return url
  }

  private async resolveSiteId(siteUrl: string): Promise<string> {
    const u = new URL(siteUrl)
    const site = await this.graph<{ id: string }>("GET", `/sites/${u.host}:${u.pathname}`)
    return site.id
  }

  // Add a document library by display name if it isn't already a drive on the site.
  private async ensureLibrary(siteId: string, name: string): Promise<void> {
    const drives = await this.graph<{ value: { name: string }[] }>("GET", `/sites/${siteId}/drives?$select=name`)
    if (drives.value?.some((d) => d.name === name)) return
    await this.graph("POST", `/sites/${siteId}/lists`, { displayName: name, list: { template: "documentLibrary" } })
  }

  // Grant the RUNTIME app (RUNTIME_APP_CLIENT_ID) Sites.Selected write on the new
  // site — this is what keeps the everyday app least-privilege.
  private async grantRuntimeApp(siteId: string): Promise<void> {
    const appId = process.env.RUNTIME_APP_CLIENT_ID
    if (!appId) throw new Error("RUNTIME_APP_CLIENT_ID not set")
    await this.graph("POST", `/sites/${siteId}/permissions`, {
      roles: ["write"],
      grantedToIdentities: [{ application: { id: appId, displayName: "adsm-api" } }]
    })
  }
}
