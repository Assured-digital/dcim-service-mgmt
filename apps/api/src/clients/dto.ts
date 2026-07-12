import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PlatformModule } from "@prisma/client";

export const CLIENT_LIFECYCLE_STAGES = ["PROSPECT", "ONBOARDING", "ACTIVE", "FORMER"] as const;

// Runtime list of licensable module keys (from the Prisma enum) for validation.
const PLATFORM_MODULES = Object.values(PlatformModule) as string[];

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string;

  @IsOptional()
  @IsIn([...CLIENT_LIFECYCLE_STAGES])
  lifecycleStage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  sharePointFolderPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sharePointSiteId?: string;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string;

  @IsOptional()
  @IsIn([...CLIENT_LIFECYCLE_STAGES])
  lifecycleStage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  sharePointFolderPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sharePointSiteId?: string;
}

// A2 — the full enabled-module set for a client (declarative; anything omitted
// is disabled).
export class SetClientModulesDto {
  @IsArray()
  @IsIn(PLATFORM_MODULES, { each: true })
  modules!: string[];
}
