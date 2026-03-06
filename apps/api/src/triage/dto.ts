import { IncidentSeverity } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export enum TriageSourceType {
  REQUEST_INTAKE = "REQUEST_INTAKE",
  PUBLIC_SUBMISSION = "PUBLIC_SUBMISSION"
}

export enum TriageConvertTargetType {
  SERVICE_REQUEST = "SERVICE_REQUEST",
  INCIDENT = "INCIDENT",
  TASK = "TASK"
}

export class ConvertTriageItemDto {
  @IsEnum(TriageConvertTargetType)
  targetType!: TriageConvertTargetType;

  @IsString()
  @MinLength(3)
  priority!: string;

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
  incidentSeverity?: IncidentSeverity;

  @IsOptional()
  @IsDateString()
  taskDueAt?: string;

  @IsOptional()
  @IsString()
  triageNotes?: string;
}

