import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator"

export class CreateWorkPackageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsIn(["MANAGED_SERVICE", "PROJECT", "AUDIT", "ADVISORY", "MIGRATION", "OTHER"])
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