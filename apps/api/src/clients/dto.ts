import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const CLIENT_LIFECYCLE_STAGES = ["PROSPECT", "ONBOARDING", "ACTIVE", "FORMER"] as const;

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string;

  @IsOptional()
  @IsIn([...CLIENT_LIFECYCLE_STAGES])
  lifecycleStage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  sharePointFolderPath?: string;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string;

  @IsOptional()
  @IsIn([...CLIENT_LIFECYCLE_STAGES])
  lifecycleStage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  sharePointFolderPath?: string;
}
