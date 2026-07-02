import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator"

export class CreateSiteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  postcode?: string

  @IsOptional()
  @IsString()
  country?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  // Contracted capacity (DCIM spec §5) — the client-report denominators.
  @IsOptional()
  @IsNumber()
  @Min(0)
  contractedKw?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  contractedU?: number | null

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  postcode?: string

  @IsOptional()
  @IsString()
  country?: string

  @IsOptional()
  @IsString()
  notes?: string
}