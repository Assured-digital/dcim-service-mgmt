import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { S3StorageProvider } from "./s3.provider";
import { AzureBlobStorageProvider } from "./azure.provider";
import { SharePointStorageProvider } from "./sharepoint.provider";
import { MsGraphModule } from "../msgraph/msgraph.module";

@Global()
@Module({
  imports: [MsGraphModule],
  providers: [StorageService, S3StorageProvider, AzureBlobStorageProvider, SharePointStorageProvider],
  exports: [StorageService]
})
export class StorageModule {}
