import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export class CreateRiskDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsString()
  @MinLength(10)
  description!: string

  @IsOptional()
  @IsIn(["LOW", "MEDIUM", "HIGH"])
  likelihood?: string

  @IsOptional()
  @IsIn(["LOW", "MEDIUM", "HIGH"])
  impact?: string

  @IsOptional()
  @IsString()
  mitigationPlan?: string
}

export class UpdateRiskStatusDto {
  @IsString()
  @IsIn(["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"])
  status!: string

  @IsOptional()
  @IsString()
  acceptanceNote?: string
}