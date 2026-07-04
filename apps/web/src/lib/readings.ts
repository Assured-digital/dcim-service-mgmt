import { api } from "./api"
import type { Health } from "./capacity"
import type { ThemeMode } from "../components/shared/tokens/colors"

// Measured telemetry client (Horizon 3). Manual/CSV field readings per asset.
export const SENSOR_METRICS = ["powerW", "temperatureC", "humidityPct"] as const
export type SensorMetric = (typeof SENSOR_METRICS)[number]

export const METRIC_LABEL: Record<SensorMetric, string> = {
  powerW: "Power", temperatureC: "Temperature", humidityPct: "Humidity",
}
export const METRIC_UNIT: Record<SensorMetric, string> = {
  powerW: "W", temperatureC: "°C", humidityPct: "%RH",
}

export type SensorReading = { id: string; metric: string; value: number; readAt: string; source: string }

export async function listReadings(assetId: string, metric?: SensorMetric): Promise<SensorReading[]> {
  return (await api.get<SensorReading[]>(`/assets/${assetId}/readings`, { params: metric ? { metric } : {} })).data
}
export async function recordReading(assetId: string, dto: { metric: SensorMetric; value: number; readAt?: string }): Promise<SensorReading> {
  return (await api.post<SensorReading>(`/assets/${assetId}/readings`, dto)).data
}
export type ImportResult = { created: number; skipped: number; errors: { row: number; reason: string }[] }
export async function importReadings(rows: { assetTag?: string; assetId?: string; metric: string; value: number; readAt?: string }[]): Promise<ImportResult> {
  return (await api.post<ImportResult>("/sensor-readings/import", { rows })).data
}

// Health → colour (mode-aware). Mirrors the RAG palette; UNKNOWN is neutral
// (absent data is not a failure — the §6b honesty rule).
export function healthColor(h: Health, mode: ThemeMode): string {
  const dark = mode === "dark"
  switch (h) {
    case "OK": return dark ? "#22c55e" : "#15803d"
    case "WARNING": return dark ? "#f59e0b" : "#b45309"
    case "CRITICAL": return dark ? "#ef4444" : "#b91c1c"
    default: return dark ? "#475569" : "#94a3b8"
  }
}
export const HEALTH_LABEL: Record<Health, string> = {
  OK: "OK", WARNING: "Warning", CRITICAL: "Critical", UNKNOWN: "Not monitored",
}
