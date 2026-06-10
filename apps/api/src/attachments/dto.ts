import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { ATTACHMENT_RECORD_TYPES, AttachmentRecordType } from "../record-links/resolve-links";

// The target record an upload attaches to. The eight attachable types (the six
// link types + maintenance + check). This is the SEPARATE attachment list — record-
// links still validates against the six, so maintenance/check are not linkable.
export class CreateAttachmentDto {
  @IsIn(ATTACHMENT_RECORD_TYPES)
  recordType!: AttachmentRecordType;

  @IsString()
  @IsNotEmpty()
  recordId!: string;
}
