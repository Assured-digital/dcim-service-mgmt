import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator"

export class CreateCabinetDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsIn(["RACK", "CABINET", "CAGE", "COLOCATION", "WALL_MOUNT", "OPEN_FRAME"])
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

  @IsOptional()
  @IsString()
  roomId?: string
}

export class UpdateCabinetDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsIn(["RACK", "CABINET", "CAGE", "COLOCATION", "WALL_MOUNT", "OPEN_FRAME"])
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

  @IsOptional()
  @IsString()
  roomId?: string | null
}

// Advisory U-range reservation (DCIM spec §2). expiresAt: omitted → server
// defaults to now + 1 month; explicit null → open-ended.
export class CreateReservationDto {
  @IsInt()
  @Min(1)
  uStart!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  uHeight?: number

  @IsOptional()
  @IsIn(["FRONT", "REAR"])
  rackSide?: string | null

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string

  @IsOptional()
  expiresAt?: string | null
}

export class UpdateReservationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  uStart?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  uHeight?: number

  @IsOptional()
  @IsIn(["FRONT", "REAR"])
  rackSide?: string | null

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string

  @IsOptional()
  expiresAt?: string | null
}