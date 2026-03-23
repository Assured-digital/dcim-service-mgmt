import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator"

export class CreateCommentDto {
  @IsString()
  @IsIn(["ChangeRequest", "Risk", "Issue", "ServiceRequest", "Incident", "Survey", "Asset", "Task"])
  entityType!: string

  @IsUUID()
  entityId!: string

  @IsString()
  @MinLength(1)
  body!: string

  @IsOptional()
  @IsUUID()
  serviceRequestId?: string
}

export class CreateCustomerUpdateDto extends CreateCommentDto {
  @IsOptional()
  @IsBoolean()
  fromCustomer?: boolean
}