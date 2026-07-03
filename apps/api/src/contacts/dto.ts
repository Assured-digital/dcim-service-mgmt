import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator"

export const CONTACT_CATEGORIES = ["DECISION_MAKER", "TECHNICAL", "BILLING", "OPERATIONS", "ACCESS", "GENERAL"] as const

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mobile?: string

  @IsOptional()
  @IsUUID()
  siteId?: string

  @IsOptional()
  @IsIn([...CONTACT_CATEGORIES])
  category?: string

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mobile?: string

  @IsOptional()
  @IsUUID()
  siteId?: string

  @IsOptional()
  @IsIn([...CONTACT_CATEGORIES])
  category?: string

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string
}
