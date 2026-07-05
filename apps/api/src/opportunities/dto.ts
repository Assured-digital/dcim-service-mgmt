import {
  IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength
} from "class-validator"

export const OPPORTUNITY_TYPES = ["NEW_BUSINESS", "RENEWAL", "EXPANSION"] as const
export const OPPORTUNITY_STAGES = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const
export const OPEN_STAGES = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] as const
export const LOST_REASONS = ["PRICE", "COMPETITOR", "NO_DECISION", "TIMING", "SCOPE", "RELATIONSHIP"] as const

// Stage-level default probabilities (CRM_DESIGN.md §4 / competitive review):
// weighted pipeline = Σ(value × probability). Re-defaulted on every stage change.
export const STAGE_PROBABILITIES: Record<string, number> = {
  DISCOVERY: 10,
  QUALIFIED: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0
}

export class CreateOpportunityDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsIn([...OPPORTUNITY_TYPES])
  type?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nextStep?: string

  @IsOptional()
  @IsDateString()
  nextStepDate?: string

  @IsOptional()
  @IsUUID()
  ownerId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsUUID()
  renewsWorkPackageId?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateOpportunityDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsIn([...OPPORTUNITY_TYPES])
  type?: string

  // Stage transitions ride PATCH too — validated by the service state machine
  // (forward-only among open stages; LOST needs lostReason; WON/LOST terminal).
  @IsOptional()
  @IsIn([...OPPORTUNITY_STAGES])
  stage?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nextStep?: string

  @IsOptional()
  @IsDateString()
  nextStepDate?: string

  @IsOptional()
  @IsUUID()
  ownerId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsIn([...LOST_REASONS])
  lostReason?: string

  @IsOptional()
  @IsString()
  lostDetail?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class CreateWorkPackageFromOpportunityDto {
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
