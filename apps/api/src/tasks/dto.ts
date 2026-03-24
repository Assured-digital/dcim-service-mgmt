import { TaskStatus } from "@prisma/client"
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from "class-validator"

export class CreateTaskDto {
  @IsString()
  @MinLength(3)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  priority?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsString()
  incidentId?: string

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

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus

  @IsOptional()
  @IsString()
  @MinLength(3)
  comment?: string
}