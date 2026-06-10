import { Injectable } from "@nestjs/common";
import type { Readable } from "stream";
import type { PresignResult } from "./storage.service";

/**
 * Azure Blob provider is scaffolded for configuration parity only.
 * Local dev and current verification run on the S3 provider (MinIO). Implement the
 * server-side put/get/delete with @azure/storage-blob in a later phase before
 * pointing STORAGE_PROVIDER=azure in any cloud environment.
 */
const NOT_IMPLEMENTED =
  "Azure Blob provider not implemented in MVP. Set STORAGE_PROVIDER=s3 for now.";

@Injectable()
export class AzureBlobStorageProvider {
  async presignUpload(filename: string, contentType: string): Promise<PresignResult> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async getObject(key: string): Promise<Readable> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async deleteObject(key: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
