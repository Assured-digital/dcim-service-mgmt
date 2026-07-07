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

// ── Parent-context links (DCIM estate) ───────────────────────────────────────
// The DCIM entities (Asset / Cabinet / Site) are the LIVE generic parent pointer
// (CLAUDE.md): a work item points at ONE parent via its linkedEntityType/Id scalar.
// These endpoints set / clear that pointer through the record-links tenant
// chokepoint, so the four work-item update paths don't each grow the logic.
export const PARENT_CHILD_TYPES = ["task", "service_request", "risk", "issue"] as const;
export type ParentChildType = (typeof PARENT_CHILD_TYPES)[number];

export const PARENT_ENTITY_TYPES = ["Asset", "Cabinet", "Site"] as const;
export type ParentEntityType = (typeof PARENT_ENTITY_TYPES)[number];

export class SetParentLinkDto {
  @IsIn(PARENT_CHILD_TYPES as unknown as string[])
  childType!: ParentChildType;

  @IsString()
  @IsNotEmpty()
  childId!: string;

  @IsIn(PARENT_ENTITY_TYPES as unknown as string[])
  parentType!: ParentEntityType;

  @IsString()
  @IsNotEmpty()
  parentId!: string;
}
