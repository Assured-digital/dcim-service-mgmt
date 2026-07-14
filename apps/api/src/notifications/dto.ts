import { IsArray, IsBoolean, IsIn, ValidateNested } from "class-validator"
import { Type } from "class-transformer"
import { NotificationType } from "@prisma/client"

const TYPES = Object.values(NotificationType) as string[]

export class NotificationPreferenceDto {
  @IsIn(TYPES)
  type!: NotificationType

  @IsBoolean()
  inApp!: boolean

  @IsBoolean()
  email!: boolean
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  preferences!: NotificationPreferenceDto[]
}
