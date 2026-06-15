import { Injectable } from "@nestjs/common";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import type { Readable } from "stream";
import type { PresignResult } from "./storage.service";

/**
 * Azure Blob provider — server-side put/get/delete, used when STORAGE_PROVIDER=azure
 * (cloud only; local dev runs the S3 provider against MinIO). Authenticates with the
 * container app's managed identity via DefaultAzureCredential — no account key stored.
 * Mirrors the S3 provider: memoised idempotent container creation + a Readable get stream.
 */
const PRESIGN_UNUSED =
  "presignUpload is not used by the attachments feature (bytes stream through the API).";

@Injectable()
export class AzureBlobStorageProvider {
  private container: ContainerClient;
  private containerReady?: Promise<void>;

  constructor() {
    const account = process.env.AZURE_STORAGE_ACCOUNT || "";
    const containerName = process.env.AZURE_STORAGE_CONTAINER || "attachments";
    const service = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      new DefaultAzureCredential()
    );
    this.container = service.getContainerClient(containerName);
  }

  async presignUpload(filename: string, contentType: string): Promise<PresignResult> {
    throw new Error(PRESIGN_UNUSED);
  }

  // Idempotent container creation — memoised so we probe once per process
  // (mirrors the S3 provider's ensureBucket()).
  private ensureContainer(): Promise<void> {
    if (!this.containerReady) {
      this.containerReady = (async () => {
        await this.container.createIfNotExists();
      })();
    }
    return this.containerReady;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureContainer();
    await this.container.getBlockBlobClient(key).uploadData(body, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
  }

  async getObject(key: string): Promise<Readable> {
    const res = await this.container.getBlockBlobClient(key).download();
    return res.readableStreamBody as Readable;
  }

  async deleteObject(key: string): Promise<void> {
    await this.container.getBlockBlobClient(key).deleteIfExists();
  }
}
