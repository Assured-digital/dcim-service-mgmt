import { Type } from "class-transformer"
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from "class-validator"

// One @-mention target on a comment. Polymorphic (targetType, targetId) pointer;
// Phase 1 accepts "user" only. displayName is NOT accepted from the client — it
// is resolved fresh at read time (#99 convention), never trusted from input.
export class CommentMentionInputDto {
  @IsIn(["user"])
  targetType!: string

  @IsString()
  @IsNotEmpty()
  targetId!: string
}

export class CreateCommentDto {
  @IsString()
  @IsIn(["ChangeRequest", "Risk", "Issue", "ServiceRequest", "Incident", "Survey", "Asset", "Task"])
  entityType!: string

  @IsUUID()
  entityId!: string

  // Plain-text body. Optional at the DTO level because a rich comment derives its
  // body server-side from bodyJson; the service enforces a non-empty final body.
  @IsOptional()
  @IsString()
  body?: string

  // Rich-text representation (TipTap document JSON). When present, the server
  // derives the plain-text body from it.
  @IsOptional()
  @IsObject()
  bodyJson?: Record<string, unknown>

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommentMentionInputDto)
  mentions?: CommentMentionInputDto[]

  @IsOptional()
  @IsUUID()
  serviceRequestId?: string
}

export class CreateCustomerUpdateDto extends CreateCommentDto {
  @IsOptional()
  @IsBoolean()
  fromCustomer?: boolean
}

// A reply to a top-level comment. A reply is a full rich comment (bodyJson +
// mentions) — it just carries a parent. It does NOT take entityType/entityId/type:
// those are INHERITED from the parent post server-side (a reply belongs to the same
// record + thread), so the client cannot place a reply on a different record than
// its parent. Two-level enforcement (parent must itself be top-level) lives in the
// service.
export class CreateReplyDto {
  @IsUUID()
  parentCommentId!: string

  @IsOptional()
  @IsString()
  body?: string

  @IsOptional()
  @IsObject()
  bodyJson?: Record<string, unknown>

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommentMentionInputDto)
  mentions?: CommentMentionInputDto[]
}
