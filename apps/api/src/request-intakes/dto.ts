import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateRequestIntakeDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  impact?: string;

  @IsOptional()
  @IsString()
  urgency?: string;
}

