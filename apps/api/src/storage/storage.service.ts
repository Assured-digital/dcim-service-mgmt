import { Injectable } from "@nestjs/common";
import type { Readable } from "stream";
import { S3StorageProvider } from "./s3.provider";
import { AzureBlobStorageProvider } from "./azure.provider";
import { SharePointStorageProvider } from "./sharepoint.provider";

export type PresignResult = { uploadUrl: string; objectKey: string; publicUrl?: string };

// Byte-store abstraction. New writes go to the ACTIVE provider (STORAGE_PROVIDER).
// Reads/deletes can target a NAMED provider so objects written under a previous
// backend (persisted on Attachment.storageProvider) keep resolving after a switch —
// e.g. flipping to SharePoint while legacy files remain in Azure Blob (dual-read).
@Injectable()
export class StorageService {
  constructor(
    private s3: S3StorageProvider,
    private azure: AzureBlobStorageProvider,
    private sharepoint: SharePointStorageProvider
  ) {}

  // The provider new uploads are written to — persisted on the Attachment row so
  // reads resolve to the right backend even after STORAGE_PROVIDER changes.
  activeName(): string {
    return (process.env.STORAGE_PROVIDER || "s3").toLowerCase();
  }

  private byName(name?: string) {
    switch ((name || this.activeName()).toLowerCase()) {
      case "azure": return this.azure;
      case "sharepoint": return this.sharepoint;
      default: return this.s3;
    }
  }

  // Legacy presign path — kept for config parity but not used by the attachments
  // feature (which streams bytes through the API, no pre-signed URLs).
  async presignUpload(filename: string, contentType: string): Promise<PresignResult> {
    return this.byName().presignUpload(filename, contentType);
  }

  // Server-side object operations. Bytes flow through the API in both directions so
  // every read re-checks tenant scope at the controller (no pre-signed URLs). New
  // writes use the active provider; reads/deletes may name the object's backend.
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.byName().putObject(key, body, contentType);
  }

  async getObject(key: string, provider?: string): Promise<Readable> {
    return this.byName(provider).getObject(key);
  }

  async deleteObject(key: string, provider?: string): Promise<void> {
    return this.byName(provider).deleteObject(key);
  }
}
