import { IsIn, IsString } from "class-validator"

const WATCHABLE_TYPES = ["Incident", "ServiceRequest", "ChangeRequest", "Task", "Risk", "Issue"]

export class WatchTargetDto {
  @IsIn(WATCHABLE_TYPES)
  recordType!: string

  @IsString()
  recordId!: string
}
