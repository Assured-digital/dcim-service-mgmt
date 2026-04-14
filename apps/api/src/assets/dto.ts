import { IsEnum, IsInt, IsNumber, IsOptional, IsString } from "class-validator"
import { AssetLifecycleState, OwnerType } from "@prisma/client"

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
  lifecycleStatus?: string  // kept for backwards compat

  @IsOptional()
  @IsEnum(AssetLifecycleState)
  lifecycleState?: AssetLifecycleState

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  rackSide?: "FRONT" | "REAR"
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  assetTag?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  assetType?: string

  @IsOptional()
  @IsString()
  siteId?: string | null

  @IsOptional()
  @IsString()
  cabinetId?: string | null

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
  uHeight?: number | null

  @IsOptional()
  @IsInt()
  uPosition?: number | null

  @IsOptional()
  @IsNumber()
  powerDrawW?: number | null

  @IsOptional()
  @IsString()
  ipAddress?: string

  @IsOptional()
  @IsEnum(AssetLifecycleState)
  lifecycleState?: AssetLifecycleState

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  rackSide?: "FRONT" | "REAR" | null
}