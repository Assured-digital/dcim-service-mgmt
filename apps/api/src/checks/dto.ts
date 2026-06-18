import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator"

export class CreateCheckTemplateDto {
  @IsString()
  name!: string

  @IsString()
  checkType!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  clientId?: string

  @IsOptional()
  @IsString()
  siteId?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number
}

export class CreateCheckTemplateItemDto {
  @IsInt()
  sortOrder!: number

  @IsString()
  label!: string

  @IsOptional()
  @IsString()
  section?: string

  @IsOptional()
  @IsString()
  guidance?: string

  @IsOptional()
  @IsIn(["PASS_FAIL", "PASS_FAIL_NA"])
  responseType?: string

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean

  @IsOptional()
  @IsBoolean()
  isCritical?: boolean
}

export class CreateCheckDto {
  @IsString()
  templateId!: string

  @IsString()
  siteId!: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @IsString()
  scheduledAt?: string

  @IsOptional()
  @IsString()
  scopeNotes?: string

  @IsOptional()
  @IsString()
  priority?: string
}

export class UpdateCheckItemDto {
  @IsOptional()
  @IsString()
  response?: string

  @IsOptional()
  @IsString()
  notes?: string
}

// Pre-start reschedule / reassign (the draft briefing page). Both optional and nullable:
// omit a field to leave it; send null/"" to clear it. @IsOptional skips validation for
// null, so an explicit clear is accepted. Service rejects non-pre-start checks.
export class UpdateCheckDto {
  @IsOptional()
  @IsString()
  scheduledAt?: string | null

  @IsOptional()
  @IsString()
  assigneeId?: string | null
}

export class CreateFollowOnDto {
  @IsIn(["Task", "Risk", "Issue"])
  entityType!: string

  @IsString()
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  priority?: string

  @IsOptional()
  @IsString()
  severity?: string

  @IsOptional()
  @IsString()
  likelihood?: string

  @IsOptional()
  @IsString()
  impact?: string

  @IsOptional()
  @IsString()
  note?: string
}

export class ReviewCheckDto {
  @IsOptional()
  @IsString()
  reviewerNotes?: string
}

export class SubmitCheckDto {
  @IsOptional()
  @IsString()
  engineerSummary?: string
}

export class CancelCheckDto {
  @IsString()
  cancellationReason!: string
}