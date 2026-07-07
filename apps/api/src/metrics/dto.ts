import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";

// Shared query for the trend metrics. `from`/`to` are ISO date-times bounding the window by
// resolution time; `bucket` controls the time-series granularity. All optional — the service
// defaults to the last 30 days bucketed by day.
export class MetricsTrendQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(["day", "week", "month"])
  bucket?: "day" | "week" | "month";

  // Optional assignee narrowing (mirrors the dashboard Trend Snapshot filter). Composes with the
  // ENGINEER assigned-only scope applied in the service.
  @IsOptional()
  @IsString()
  assigneeId?: string;
}
