import { Injectable, Logger } from "@nestjs/common"
import type { Readable } from "stream"
import { PrismaService } from "../prisma/prisma.service"
import { MsGraphService, SP_LIBRARY } from "../msgraph/msgraph.service"
import type { PresignResult } from "./storage.service"

/**
 * SharePoint storage provider (C1a) — used when STORAGE_PROVIDER=sharepoint.
 * Writes attachment bytes into the client's OWN SharePoint site (site-per-client),
 * in the internal "Evidence" library (guests are never invited there). The
 * StorageService interface stays key-only: the client is parsed from the storage
 * key (`clientId/...`) and its site resolved from Client.sharePointSiteId — so
 * tenant isolation remains the app's clientId boundary, not SharePoint's. Downloads
 * stream a Readable back THROUGH the API (the per-access tenant re-check lives in
 * AttachmentsService) — never a public/SAS URL. Inert unless GRAPH_ENABLED.
 */
const PRESIGN_UNUSED =
  "presignUpload is not used by the attachments feature (bytes stream through the API)."

@Injectable()
export class SharePointStorageProvider {
  private readonly logger = new Logger(SharePointStorageProvider.name)

  constructor(private prisma: PrismaService, private graph: MsGraphService) {}

  async presignUpload(_filename: string, _contentType: string): Promise<PresignResult> {
    throw new Error(PRESIGN_UNUSED)
  }

  // storageKey = `${clientId}/${recordType}/${uuid}-${size}`. The site is the
  // client's own, so the clientId segment is dropped from the in-library path.
  private async resolve(key: string): Promise<{ siteId: string; path: string }> {
    const [clientId, ...rest] = key.split("/")
    if (!clientId || rest.length === 0) throw new Error(`Malformed storage key: ${key}`)
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { sharePointSiteId: true }
    })
    const siteId = client?.sharePointSiteId?.trim()
    if (!siteId) throw new Error(`Client ${clientId} has no SharePoint site provisioned`)
    return { siteId, path: rest.join("/") }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const { siteId, path } = await this.resolve(key)
    await this.graph.uploadFile(siteId, SP_LIBRARY.EVIDENCE, path, body, contentType)
  }

  async getObject(key: string): Promise<Readable> {
    const { siteId, path } = await this.resolve(key)
    return this.graph.downloadFile(siteId, SP_LIBRARY.EVIDENCE, path)
  }

  async deleteObject(key: string): Promise<void> {
    const { siteId, path } = await this.resolve(key)
    await this.graph.deleteFile(siteId, SP_LIBRARY.EVIDENCE, path)
  }
}
