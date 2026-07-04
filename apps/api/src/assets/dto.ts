import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString } from "class-validator"
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

  // Optional catalogue FK — set when the asset was created via the device-type
  // picker. null = free-text/manual entry (the denormalised strings below carry
  // the manufacturer/model in that case).
  @IsOptional()
  @IsString()
  deviceTypeId?: string

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

  // Budgeted watts override (spec §4.1) — blank lets the server stamp
  // nameplate × derate at placement.
  @IsOptional()
  @IsNumber()
  budgetedDrawW?: number

  @IsOptional()
  @IsNumber()
  weightKg?: number

  // Placement semantics (DCIM spec §2.2). isFullDepth omitted → denormalised
  // from the DeviceType server-side; isZeroU → side-mounted, uPosition ignored.
  @IsOptional()
  @IsBoolean()
  isFullDepth?: boolean

  @IsOptional()
  @IsBoolean()
  isZeroU?: boolean

  // Advisory-reservation override (spec §2.2): retry the placement with the id
  // from the 409 response's `reservation.id` to place anyway.
  @IsOptional()
  @IsString()
  overrideReservationId?: string

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
  // User-defined custom properties (register power-features) — a { key: value }
  // map merged into Asset.customValues. Unknown keys are allowed (the field
  // schema is validated in the UI, not enforced here).
  @IsOptional()
  @IsObject()
  customValues?: Record<string, unknown>

  // Attach / change / clear the catalogue link on an existing asset. Attaching a
  // type re-stamps the denormalised specs (spec §3.2); null unlinks (free-text).
  @IsOptional()
  @IsString()
  deviceTypeId?: string | null

  @IsOptional()
  @IsNumber()
  weightKg?: number | null

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
  @IsNumber()
  budgetedDrawW?: number | null

  @IsOptional()
  @IsBoolean()
  isFullDepth?: boolean | null

  @IsOptional()
  @IsBoolean()
  isZeroU?: boolean

  @IsOptional()
  @IsString()
  overrideReservationId?: string

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

export class DecommissionAssetDto {
  @IsIn(["RETIRE", "REMOVE", "DISPOSE"])
  step!: "RETIRE" | "REMOVE" | "DISPOSE"
}

export class RaiseWorkOrderDto {
  @IsIn(["INSTALL", "DECOMMISSION", "MOVE"])
  op!: "INSTALL" | "DECOMMISSION" | "MOVE"

  @IsIn(["task", "change"])
  workOrderType!: "task" | "change"

  @IsOptional() @IsString()
  title?: string

  @IsOptional() @IsString()
  description?: string

  @IsOptional() @IsString()
  priority?: string

  @IsOptional() @IsString()
  changeType?: string

  @IsOptional() @IsString()
  scheduledStart?: string

  @IsOptional() @IsString()
  scheduledEnd?: string

  @IsOptional() @IsString()
  assigneeId?: string

  // MOVE target (op = "MOVE" only): the destination the asset relocates to when
  // the work order completes. targetRackSide defaults FRONT.
  @IsOptional() @IsString()
  targetCabinetId?: string

  @IsOptional() @IsInt()
  targetUPosition?: number

  @IsOptional() @IsIn(["FRONT", "REAR"])
  targetRackSide?: "FRONT" | "REAR"
}

export class RequestAssetDeletionDto {
  @IsOptional()
  @IsString()
  reason?: string
}

export class RejectAssetDeletionDto {
  @IsOptional()
  @IsString()
  notes?: string
}