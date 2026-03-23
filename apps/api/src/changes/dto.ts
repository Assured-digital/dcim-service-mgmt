import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator"

export class CreateChangeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsString()
  @MinLength(10)
  description!: string

  @IsOptional()
  @IsIn(["STANDARD", "NORMAL", "EMERGENCY"])
  changeType?: string

  @IsOptional()
  @IsIn(["low", "medium", "high", "critical"])
  priority?: string

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsString()
  impactAssessment?: string

  @IsOptional()
  @IsString()
  rollbackPlan?: string

  @IsOptional()
  @IsDateString()
  scheduledStart?: string

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string

  @IsOptional()
  @IsUUID()
  assigneeId?: string
}

export class UpdateChangeStatusDto {
  @IsString()
  @IsIn(["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED"])
  status!: string

  @IsOptional()
  @IsString()
  implementationNotes?: string

  @IsOptional()
  @IsString()
  postImplReview?: string
}

export class AddApprovalDto {
  @IsString()
  @IsIn(["APPROVED", "REJECTED", "DEFERRED"])
  decision!: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateChangeDto {
  @IsOptional()
  @IsIn(["low", "medium", "high", "critical"])
  priority?: string

  @IsOptional()
  @IsUUID()
  assigneeId?: string

  @IsOptional()
  @IsDateString()
  scheduledStart?: string

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string
}