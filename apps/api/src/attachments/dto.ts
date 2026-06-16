import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ATTACHMENT_RECORD_TYPES, AttachmentRecordType } from "../record-links/resolve-links";

// Longest accepted caption — a short label, not free-form prose. Enforced here and
// re-clamped server-side (normalizeCaption) so a direct API caller can't exceed it.
export const MAX_CAPTION_LENGTH = 280;

// The target record an upload attaches to. The eight attachable types (the six
// link types + maintenance + check). This is the SEPARATE attachment list — record-
// links still validates against the six, so maintenance/check are not linkable.
export class CreateAttachmentDto {
  @IsIn(ATTACHMENT_RECORD_TYPES)
  recordType!: AttachmentRecordType;

  @IsString()
  @IsNotEmpty()
  recordId!: string;

  // Optional caption captured alongside the file (frictionless field-evidence labelling).
  // Multipart sends it as a form field; absent/blank => stored NULL.
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CAPTION_LENGTH)
  caption?: string;
}

// Edit just the caption of an existing attachment. A blank/absent caption clears it
// (stored NULL). Rejected by the service if the owning check is COMPLETED/CLOSED.
export class UpdateAttachmentCaptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CAPTION_LENGTH)
  caption?: string;
}
