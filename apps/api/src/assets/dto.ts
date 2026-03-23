import { IsEnum, IsInt, IsNumber, IsOptional, IsString } from "class-validator"
import { OwnerType } from "@prisma/client"

export class CreateAssetDto {
  @IsString()
  assetTag!: string

  @IsString()
  name!: string

  @IsString()
  assetType!: string

  @IsEnum(OwnerType)
  ownerType!: OwnerType

  @IsOptional()
  @IsString()
  clientId?: string

  @IsOptional()
  @IsString()
  siteId?: string

  @IsOptional()
  @IsString()
  cabinetId?: string

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @IsString()
  manufacturer?: string

  @IsOptional()
  @IsString()
  modelNumber?: string

  @IsOptional()
  @IsString()
  serialNumber?: string

  @IsOptional()
  @IsInt()
  uHeight?: number

  @IsOptional()
  @IsInt()
  uPosition?: number

  @IsOptional()
  @IsNumber()
  powerDrawW?: number

  @IsOptional()
  @IsString()
  ipAddress?: string

  @IsOptional()
  @IsString()
  warrantyExpiry?: string

  @IsOptional()
  @IsString()
  lifecycleStatus?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  location?: string
}