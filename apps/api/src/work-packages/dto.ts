import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator"

const WP_TYPES = ["MANAGED_SERVICE", "PROJECT", "AUDIT", "ADVISORY", "MIGRATION", "OTHER"]
const WP_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]

export class CreateWorkPackageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsIn(WP_TYPES)
  type?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsNumber()
  value?: number

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  siteIds?: string[]
}

// Contract-layer edits (CRM_DESIGN.md §3) — renewal fields + core fields.
export class UpdateWorkPackageDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsIn(WP_TYPES)
  type?: string

  @IsOptional()
  @IsIn(WP_STATUSES)
  status?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsNumber()
  value?: number

  @IsOptional()
  @IsDateString()
  renewalDate?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  noticePeriodDays?: number

  @IsOptional()
  @IsBoolean()
  autoRenews?: boolean

  @IsOptional()
  @IsString()
  commercialNotes?: string
}