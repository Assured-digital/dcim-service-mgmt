import {
  IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested
} from "class-validator"
import { Type } from "class-transformer"

export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"] as const

// Legal lifecycle moves (CRM_DESIGN.md §4). Post-DRAFT quotes are read-only;
// "revise" is a separate endpoint (withdraw + clone v+1), not a status PATCH.
export const QUOTE_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["SENT", "WITHDRAWN"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  WITHDRAWN: []
}

export class QuoteLineItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string

  @IsNumber()
  @Min(0)
  quantity!: number

  @IsNumber()
  @Min(0)
  unitPrice!: number
}

export class CreateQuoteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  validUntil?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsUUID()
  opportunityId?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemDto)
  lineItems?: QuoteLineItemDto[]
}

export class UpdateQuoteDto {
  // Content fields — DRAFT only (enforced in the service).
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  validUntil?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsUUID()
  opportunityId?: string

  @IsOptional()
  @IsString()
  notes?: string

  // Status transitions — validated against QUOTE_TRANSITIONS.
  @IsOptional()
  @IsIn([...QUOTE_STATUSES])
  status?: string
}

export class ReplaceLineItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemDto)
  lineItems!: QuoteLineItemDto[]
}

export class CreateWorkPackageFromQuoteDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsIn(["MANAGED_SERVICE", "PROJECT", "AUDIT", "ADVISORY", "MIGRATION", "OTHER"])
  type?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string
}
