import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator"
import { MaintenanceWorkType } from "@prisma/client"

export class ListMaintenanceQueryDto {
  @IsOptional()
  @IsUUID()
  assetId?: string

  @IsOptional()
  @IsUUID()
  siteId?: string

  @IsOptional()
  @IsUUID()
  performedById?: string

  @IsOptional()
  @IsEnum(MaintenanceWorkType)
  workType?: MaintenanceWorkType

  @IsOptional()
  @IsDateString()
  from?: string

  @IsOptional()
  @IsDateString()
  to?: string
}

export class CreateMaintenanceDto {
  @IsUUID()
  assetId!: string

  @IsOptional()
  @IsEnum(MaintenanceWorkType)
  workType?: MaintenanceWorkType

  @IsOptional()
  @IsString()
  workTypeOther?: string

  @IsDateString()
  performedAt!: string

  @IsOptional()
  @IsUUID()
  performedById?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsDateString()
  nextDueAt?: string
}

export class UpdateMaintenanceDto {
  @IsOptional()
  @IsUUID()
  assetId?: string

  @IsOptional()
  @IsEnum(MaintenanceWorkType)
  workType?: MaintenanceWorkType

  @IsOptional()
  @IsString()
  workTypeOther?: string

  @IsOptional()
  @IsDateString()
  performedAt?: string

  @IsOptional()
  @IsUUID()
  performedById?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsDateString()
  nextDueAt?: string
}
