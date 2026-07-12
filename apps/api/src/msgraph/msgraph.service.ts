import { Injectable, Logger } from "@nestjs/common"
import { DefaultAzureCredential } from "@azure/identity"
import { Readable } from "node:stream"

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
// Env-gated: inert until GRAPH_ENABLED=true, so deploying this code changes
// nothing until the flag is flipped (gotcha #6). The SharePoint site is now
// PER-CLIENT (Client.sharePointSiteId, site-per-client model) — resolved by the
// caller and passed in; there is no single SHAREPOINT_SITE_ID env var. Global
// fetch (Node 20) — no Graph SDK dependency, no container rebuild.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const GRAPH_SCOPE = "https://graph.microsoft.com/.default"
// Graph's simple-PUT limit; larger uploads use a resumable session.
const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024

// The two document libraries in each client site (site-per-client, C1). Names
// MUST match the SharePoint library display names exactly (they are the Graph
// drive names). Documents = shared with the client's guests; Evidence = internal
// (app-written attachments; guests not invited).
export const SP_LIBRARY = { DOCUMENTS: "Documents", EVIDENCE: "Evidence" } as const
export type SpLibrary = (typeof SP_LIBRARY)[keyof typeof SP_LIBRARY]

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

// Normalised inbound email (CRM_DESIGN.md §8 phase 7b). Participants are the
// union of from + to + cc addresses, lower-cased — the match keys for the
// correlation ladder.
export type MailMessage = {
  internetMessageId: string
  conversationId?: string
  subject: string
  fromAddress: string
  fromName?: string
  participants: string[]
  receivedDateTime: string
  bodyPreview?: string
  webLink?: string
}

@Injectable()
export class MsGraphService {
  private readonly logger = new Logger(MsGraphService.name)
  private credential = new DefaultAzureCredential()
  private driveIdCache = new Map<string, string>() // key: `${siteId}|${library}`
  private token?: { value: string; expiresOnTimestamp: number }

  // GRAPH_ENABLED gates ALL Graph use. The site is per-client now
  // (Client.sharePointSiteId), so there is no single SHAREPOINT_SITE_ID; callers
  // pass the resolved site id and treat "no site on the client" as unmapped.
  isConfigured(): boolean {
    return process.env.GRAPH_ENABLED === "true"
  }

  // Mail sync is gated separately (its own Entra permission — Mail.Read
  // application, scoped to the one mailbox by an Exchange application access
  // policy — and its own env, so SharePoint and mail can ship independently).
  isMailConfigured(): boolean {
    return process.env.GRAPH_ENABLED === "true" && !!process.env.CRM_MAILBOX_ADDRESS
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

  // Resolve the drive id for a named library within a client's site (memoised
  // per site+library). Each SharePoint document library is its own drive, so
  // Documents (shared) and Evidence (internal) resolve to different drives.
  private async driveId(siteId: string, library: SpLibrary): Promise<string> {
    const cacheKey = `${siteId}|${library}`
    const hit = this.driveIdCache.get(cacheKey)
    if (hit) return hit
    const data = await this.graphGet<{ value: { id: string; name: string }[] }>(
      `/sites/${encodeURIComponent(siteId)}/drives?$select=id,name`
    )
    const drive = data.value.find((d) => d.name === library)
    if (!drive) throw new Error(`SharePoint library "${library}" not found on site ${siteId}`)
    this.driveIdCache.set(cacheKey, drive.id)
    return drive.id
  }

  // Drive-relative path → URL-encoded segments (strips leading/trailing slashes).
  private encodePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map(encodeURIComponent).join("/")
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

  // List the children of a folder within a library (empty path = library root).
  async listChildren(siteId: string, library: SpLibrary, folderPath = ""): Promise<DriveItem[]> {
    const driveId = await this.driveId(siteId, library)
    const clean = this.encodePath(folderPath)
    const loc = clean
      ? `/drives/${driveId}/root:/${clean}:/children`
      : `/drives/${driveId}/root/children`
    const data = await this.graphGet<{ value: any[] }>(`${loc}?$top=200&$orderby=name`)
    return data.value.map((v) => this.mapItem(v))
  }

  // Search within a library, optionally scoped to a subfolder. Empty folderPath
  // searches the whole library from its root.
  async searchInLibrary(siteId: string, library: SpLibrary, folderPath: string, query: string): Promise<DriveItem[]> {
    const driveId = await this.driveId(siteId, library)
    const clean = this.encodePath(folderPath)
    const scope = clean
      ? (await this.graphGet<{ id: string }>(`/drives/${driveId}/root:/${clean}`)).id
      : "root"
    const q = encodeURIComponent(query.replace(/'/g, "''"))
    const data = await this.graphGet<{ value: any[] }>(
      `/drives/${driveId}/items/${scope}/search(q='${q}')?$top=100`
    )
    return data.value.map((v) => this.mapItem(v))
  }

  // ── Write side (C1a — attachments → SharePoint) ───────────────────────────
  // Upload bytes to a drive-relative path. Simple PUT ≤4MB; a resumable upload
  // session above that (single PUT of the whole buffer — within the 25MB
  // attachment cap, well under Graph's 60MiB per-request limit). Overwrites.
  async uploadFile(siteId: string, library: SpLibrary, path: string, body: Buffer, contentType: string): Promise<DriveItem> {
    const driveId = await this.driveId(siteId, library)
    const enc = this.encodePath(path)
    if (body.length <= SIMPLE_UPLOAD_MAX) {
      const token = await this.getToken()
      const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${enc}:/content`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        body: body as unknown as BodyInit
      })
      if (!res.ok) throw await this.writeError("upload", res, path)
      return this.mapItem(await res.json())
    }
    // Large file → resumable upload session. The uploadUrl is pre-authorised —
    // do NOT send the bearer token to it.
    const uploadUrl = await this.createUploadSession(driveId, enc)
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(body.length),
        "Content-Range": `bytes 0-${body.length - 1}/${body.length}`
      },
      body: body as unknown as BodyInit
    })
    if (!res.ok) throw await this.writeError("upload", res, path)
    return this.mapItem(await res.json())
  }

  private async createUploadSession(driveId: string, encPath: string): Promise<string> {
    const token = await this.getToken()
    const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encPath}:/createUploadSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } })
    })
    if (!res.ok) throw await this.writeError("createUploadSession", res, encPath)
    return ((await res.json()) as { uploadUrl: string }).uploadUrl
  }

  // Stream a file's bytes for download. Returns a Node Readable so the API can
  // stream it through with the tenant re-check — never a public/SAS URL.
  async downloadFile(siteId: string, library: SpLibrary, path: string): Promise<Readable> {
    const driveId = await this.driveId(siteId, library)
    const enc = this.encodePath(path)
    const token = await this.getToken()
    const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${enc}:/content`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok || !res.body) throw await this.writeError("download", res, path)
    return Readable.fromWeb(res.body as any)
  }

  async deleteFile(siteId: string, library: SpLibrary, path: string): Promise<void> {
    const driveId = await this.driveId(siteId, library)
    const enc = this.encodePath(path)
    const token = await this.getToken()
    const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${enc}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    })
    // 404 = already gone → idempotent success.
    if (!res.ok && res.status !== 404) throw await this.writeError("delete", res, path)
  }

  private async writeError(op: string, res: Response, path: string): Promise<Error> {
    const body = await res.text().catch(() => "")
    this.logger.warn(`Graph ${op} ${path} → ${res.status}: ${body.slice(0, 200)}`)
    return new Error(`Graph ${op} failed (${res.status})`)
  }

  // Read recent messages from the shared CRM mailbox (app-only Mail.Read scoped
  // to that one mailbox by the Exchange policy). Bounded by `sinceIso` when
  // given; dedupe is on internetMessageId downstream, so re-reading overlap is
  // safe. Delta-query cursoring is a later optimisation — for a low-volume CRM
  // mailbox a bounded recent read + dedupe is sufficient and stateless.
  async listMailboxMessages(sinceIso?: string): Promise<MailMessage[]> {
    const mailbox = process.env.CRM_MAILBOX_ADDRESS!
    const select = "internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,webLink"
    const filter = sinceIso ? `&$filter=receivedDateTime ge ${encodeURIComponent(sinceIso)}` : ""
    const data = await this.graphGet<{ value: any[] }>(
      `/users/${encodeURIComponent(mailbox)}/messages?$select=${select}&$top=50&$orderby=receivedDateTime desc${filter}`
    )
    return data.value.map(m => {
      const addr = (r: any): string | undefined => r?.emailAddress?.address?.toLowerCase()
      const fromAddress = addr(m.from) ?? ""
      const to = (m.toRecipients ?? []).map(addr)
      const cc = (m.ccRecipients ?? []).map(addr)
      const participants = [fromAddress, ...to, ...cc].filter((a): a is string => !!a)
      return {
        internetMessageId: m.internetMessageId,
        conversationId: m.conversationId,
        subject: m.subject ?? "(no subject)",
        fromAddress,
        fromName: m.from?.emailAddress?.name,
        participants: [...new Set(participants)],
        receivedDateTime: m.receivedDateTime,
        bodyPreview: m.bodyPreview,
        webLink: m.webLink
      }
    })
  }
}
