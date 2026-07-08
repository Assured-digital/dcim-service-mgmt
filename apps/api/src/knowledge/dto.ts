import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export const KNOWLEDGE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const

export class ListKnowledgeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string

  @IsOptional()
  @IsIn([...KNOWLEDGE_STATUSES])
  status?: string
}

export class CreateKnowledgeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string

  @IsString()
  body!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string

  @IsOptional()
  @IsIn([...KNOWLEDGE_STATUSES])
  status?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  // true = shared org-wide (clientId null); false/absent = pinned to the scoped client.
  @IsOptional()
  @IsBoolean()
  shared?: boolean
}

export class UpdateKnowledgeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  body?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string

  @IsOptional()
  @IsIn([...KNOWLEDGE_STATUSES])
  status?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsBoolean()
  shared?: boolean
}
