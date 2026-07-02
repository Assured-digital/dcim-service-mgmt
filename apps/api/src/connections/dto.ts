import { ConnectionStatus } from "@prisma/client"
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator"

export class ListConnectionsQueryDto {
  @IsOptional()
  @IsEnum(ConnectionStatus)
  status?: ConnectionStatus

  @IsOptional()
  @IsUUID()
  fromAssetId?: string

  @IsOptional()
  @IsUUID()
  toAssetId?: string

  @IsOptional()
  @IsString()
  connectionType?: string
}

export class CreateConnectionDto {
  @IsUUID()
  fromAssetId!: string

  @IsUUID()
  toAssetId!: string

  // Optional port-level endpoints (DCIM_SCHEMA_SPEC §6). Each must belong to its
  // asset; null/absent keeps the cable an asset-level link (today's behaviour).
  @IsOptional()
  @IsUUID()
  fromPortId?: string | null

  @IsOptional()
  @IsUUID()
  toPortId?: string | null

  @IsString()
  connectionType!: string

  @IsOptional()
  @IsEnum(ConnectionStatus)
  status?: ConnectionStatus

  @IsOptional()
  @IsString()
  label?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsDateString()
  installedAt?: string

  @IsOptional()
  @IsDateString()
  lastValidatedAt?: string
}

export class UpdateConnectionDto {
  @IsOptional()
  @IsUUID()
  fromAssetId?: string

  @IsOptional()
  @IsUUID()
  toAssetId?: string

  @IsOptional()
  @IsUUID()
  fromPortId?: string | null

  @IsOptional()
  @IsUUID()
  toPortId?: string | null

  @IsOptional()
  @IsString()
  connectionType?: string

  @IsOptional()
  @IsEnum(ConnectionStatus)
  status?: ConnectionStatus

  @IsOptional()
  @IsString()
  label?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsDateString()
  installedAt?: string

  @IsOptional()
  @IsDateString()
  lastValidatedAt?: string
}
