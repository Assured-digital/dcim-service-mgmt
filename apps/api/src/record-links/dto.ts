import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { LINK_RECORD_TYPES, LinkRecordType } from "./resolve-links";

export class CreateRecordLinkDto {
  @IsIn(LINK_RECORD_TYPES as unknown as string[])
  aType!: LinkRecordType;

  @IsString()
  @IsNotEmpty()
  aId!: string;

  @IsIn(LINK_RECORD_TYPES as unknown as string[])
  bType!: LinkRecordType;

  @IsString()
  @IsNotEmpty()
  bId!: string;
}

export class SearchRecordLinksQueryDto {
  @IsIn(LINK_RECORD_TYPES as unknown as string[])
  type!: LinkRecordType;

  @IsOptional()
  @IsString()
  q?: string;
}
