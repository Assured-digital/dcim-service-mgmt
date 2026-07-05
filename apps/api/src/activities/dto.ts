import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator"

export const ACTIVITY_TYPES = ["CALL", "MEETING", "EMAIL", "SITE_VISIT", "NOTE"] as const

export class CreateActivityDto {
  @IsIn([...ACTIVITY_TYPES])
  type!: string

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string

  @IsOptional()
  @IsString()
  body?: string

  @IsOptional()
  @IsDateString()
  occurredAt?: string

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  contactIds?: string[]
}

export class UpdateActivityDto {
  @IsOptional()
  @IsIn([...ACTIVITY_TYPES])
  type?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject?: string

  @IsOptional()
  @IsString()
  body?: string

  @IsOptional()
  @IsDateString()
  occurredAt?: string

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  contactIds?: string[]
}

export class CreateFollowOnTaskDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsUUID()
  assigneeId?: string
}
