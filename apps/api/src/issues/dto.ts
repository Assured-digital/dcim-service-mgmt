import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export class CreateIssueDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsString()
  @MinLength(10)
  description!: string

  @IsOptional()
  @IsIn(["RED", "AMBER", "GREEN"])
  severity?: string

  @IsOptional()
  @IsString()
  reviewDate?: string
}

export class UpdateIssueStatusDto {
  @IsString()
  @IsIn(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status!: string

  @IsOptional()
  @IsString()
  resolution?: string
}

export class UpdateIssueDto {
  @IsOptional()
  @IsIn(["RED", "AMBER", "GREEN"])
  severity?: string

  @IsOptional()
  @IsString()
  reviewDate?: string
}