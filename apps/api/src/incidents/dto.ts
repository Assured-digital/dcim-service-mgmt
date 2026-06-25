import { IncidentSeverity, IncidentStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class CreateIncidentDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsString()
  priority?: string;

  @ValidateIf((o) => o.dueAt !== undefined && o.dueAt !== null && o.dueAt !== "")
  @IsDateString()
  dueAt?: string | null;
}

export class UpdateIncidentStatusDto {
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;

  @IsOptional()
  @IsString()
  @MinLength(3)
  comment?: string;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  description?: string;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsString()
  priority?: string;

  @ValidateIf((o) => o.dueAt !== undefined && o.dueAt !== null && o.dueAt !== "")
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}
