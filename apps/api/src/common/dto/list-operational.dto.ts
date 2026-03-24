import { IsDateString, IsOptional, IsString } from "class-validator"

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
}