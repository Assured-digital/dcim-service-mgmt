import { Injectable } from "@nestjs/common";
import type { Readable } from "stream";
import { S3StorageProvider } from "./s3.provider";
import { AzureBlobStorageProvider } from "./azure.provider";

export type PresignResult = { uploadUrl: string; objectKey: string; publicUrl?: string };

@Injectable()
export class StorageService {
  constructor(private s3: S3StorageProvider, private azure: AzureBlobStorageProvider) {}

  private active() {
    const p = (process.env.STORAGE_PROVIDER || "s3").toLowerCase();
    return p === "azure" ? this.azure : this.s3;
  }

  // Legacy presign path — kept for config parity but not used by the attachments
  // feature (which streams bytes through the API, no pre-signed URLs).
  async presignUpload(filename: string, contentType: string): Promise<PresignResult> {
    return this.active().presignUpload(filename, contentType);
  }

  // Server-side object operations. Bytes flow through the API in both directions so
  // every read re-checks tenant scope at the controller (no pre-signed URLs).
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.active().putObject(key, body, contentType);
  }

  async getObject(key: string): Promise<Readable> {
    return this.active().getObject(key);
  }

  async deleteObject(key: string): Promise<void> {
    return this.active().deleteObject(key);
  }
}
