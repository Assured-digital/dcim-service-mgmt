import { Role } from "@prisma/client";
import { IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string;
}

export class CreateOrganizationSuperUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateOrganizationSuperUserDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
