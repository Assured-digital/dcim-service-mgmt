import { IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export class CreateCabinetDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsIn(["RACK", "CABINET", "CAGE", "COLOCATION"])
  type?: string

  @IsOptional()
  @IsNumber()
  totalU?: number

  @IsOptional()
  @IsNumber()
  powerKw?: number

  @IsOptional()
  @IsString()
  notes?: string
}