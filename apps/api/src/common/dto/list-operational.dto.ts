import { IsDateString, IsIn, IsOptional, IsString } from "class-validator"

export class ListOperationalQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string

  @IsOptional()
  @IsDateString()
  dateTo?: string

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @IsString()
  linkedEntityType?: string

  @IsOptional()
  @IsString()
  linkedEntityId?: string

  // Live/History split (Service Desk). "live" → non-terminal rows only.
  @IsOptional()
  @IsIn(["live"])
  scope?: string

  // History window — ISO date; returns terminal rows closed on/after it, newest first.
  @IsOptional()
  @IsDateString()
  closedSince?: string
}