import { IncidentSeverity, IncidentStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

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
}

export class UpdateIncidentStatusDto {
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;

  @IsOptional()
  @IsString()
  @MinLength(3)
  comment?: string;
}
