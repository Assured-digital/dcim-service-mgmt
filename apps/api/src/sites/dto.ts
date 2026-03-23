import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator"

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