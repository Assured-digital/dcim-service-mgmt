import { IsDateString, IsOptional, IsString, ValidateIf } from "class-validator";

export class CreateServiceRequestDto {
  @IsString()
  subject!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @ValidateIf((o) => o.dueAt !== undefined && o.dueAt !== null && o.dueAt !== "")
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  linkedEntityType?: string;

  @IsOptional()
  @IsString()
  linkedEntityId?: string;
}

export class CloseServiceRequestDto {
  @IsString()
  closureSummary!: string;
}
