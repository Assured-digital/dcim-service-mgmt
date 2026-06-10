import { Injectable } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import type { Readable } from "stream";
import type { PresignResult } from "./storage.service";

@Injectable()
export class S3StorageProvider {
  private client: S3Client;
  private bucket: string;
  private endpoint?: string;
  private bucketReady?: Promise<void>;

  constructor() {
    this.bucket = process.env.S3_BUCKET || "dcms-attachments";
    this.endpoint = process.env.S3_ENDPOINT;

    this.client = new S3Client({
      region: process.env.S3_REGION || "eu-west-2",
      endpoint: this.endpoint,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "false") === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || ""
      }
    });
  }

  async presignUpload(filename: string, contentType: string): Promise<PresignResult> {
    const objectKey = `${uuidv4()}-${filename}`;
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: 60 * 5 });

    const publicUrl = this.endpoint
      ? `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${objectKey}`
      : undefined;

    return { uploadUrl, objectKey, publicUrl };
  }

  // Idempotent bucket creation — memoised so we probe once per process. Smooths over
  // local dev where the bucket name in .env may differ from what docker-compose seeds.
  private ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        try {
          await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch {
          try {
            await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          } catch {
            // Another worker may have created it between the head and create — ignore.
          }
        }
      })();
    }
    return this.bucketReady;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length
      })
    );
  }

  async getObject(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
