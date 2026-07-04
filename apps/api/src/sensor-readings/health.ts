// Measured-telemetry helpers (DCIM_SCHEMA_SPEC §6b, Horizon 3). Pure — shared by
// the readings service and the capacity roll-up. Health is derived, never stored
// (mirrors the healthStatus honesty rule: absent data is UNKNOWN, not a problem).

export const SENSOR_METRICS = ["powerW", "temperatureC", "humidityPct"] as const
export type SensorMetric = (typeof SENSOR_METRICS)[number]

export function isSensorMetric(v: unknown): v is SensorMetric {
  return typeof v === "string" && (SENSOR_METRICS as readonly string[]).includes(v)
}

export type Health = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN"

// ASHRAE A1 thermal envelope: recommended 18–27 °C, allowable 15–32 °C. Outside
// allowable = CRITICAL, in the allowable-but-not-recommended margin = WARNING.
export function temperatureHealth(c: number): Health {
  if (c < 15 || c > 32) return "CRITICAL"
  if (c < 18 || c > 27) return "WARNING"
  return "OK"
}

// ASHRAE A1 humidity: recommended ≤ 60 %RH, allowable 8–80 %RH.
export function humidityHealth(rh: number): Health {
  if (rh < 8 || rh > 80) return "CRITICAL"
  if (rh > 60) return "WARNING"
  return "OK"
}

// Power against a declared feed capacity (kW): over feed = CRITICAL, ≥ 90 % = WARNING.
export function powerHealth(measuredKw: number, capacityKw: number | null): Health {
  if (capacityKw == null || capacityKw <= 0) return "UNKNOWN"
  const pct = (measuredKw / capacityKw) * 100
  if (pct > 100) return "CRITICAL"
  if (pct >= 90) return "WARNING"
  return "OK"
}

const RANK: Record<Health, number> = { UNKNOWN: 0, OK: 1, WARNING: 2, CRITICAL: 3 }

// Worst-of a set of healths, ignoring UNKNOWN unless it's all there is.
export function worstHealth(healths: Health[]): Health {
  const known = healths.filter((h) => h !== "UNKNOWN")
  if (known.length === 0) return "UNKNOWN"
  return known.reduce((w, h) => (RANK[h] > RANK[w] ? h : w), "OK" as Health)
}

// Latest-reading roll-up shapes (produced by SensorReadingsService.latestForAssets)
// — declared here so the pure rollup below has no dependency on the service.
export type LatestReading = { value: number; readAt: string }
export type LatestByAsset = Map<string, Partial<Record<SensorMetric, LatestReading>>>

export type CabinetEnvironment = {
  temperatureC: number | null
  humidityPct: number | null
  health: Health              // worst of power + temp + humidity; UNKNOWN if unmonitored
  readAt: string | null
}

// Per-cabinet environmental roll-up (Horizon 3): worst-case inlet temp + humidity
// across the cabinet's assets, with an ASHRAE-and-power-derived health. Shared by
// the capacity read model and the floor-plan Health lens.
export function deriveCabinetEnvironment(
  assetIds: string[], latest: LatestByAsset, measuredKw: number | null, capacityKw: number | null
): CabinetEnvironment {
  const temps: { v: number; at: string }[] = []
  const hums: { v: number; at: string }[] = []
  for (const id of assetIds) {
    const m = latest.get(id)
    if (m?.temperatureC) temps.push({ v: m.temperatureC.value, at: m.temperatureC.readAt })
    if (m?.humidityPct) hums.push({ v: m.humidityPct.value, at: m.humidityPct.readAt })
  }
  const temperatureC = temps.length ? Math.max(...temps.map((t) => t.v)) : null
  const humidityPct = hums.length ? Math.max(...hums.map((h) => h.v)) : null
  const readAt = [...temps, ...hums].map((r) => r.at).sort().at(-1) ?? null
  const health = worstHealth([
    measuredKw != null ? powerHealth(measuredKw, capacityKw) : "UNKNOWN",
    temperatureC != null ? temperatureHealth(temperatureC) : "UNKNOWN",
    humidityPct != null ? humidityHealth(humidityPct) : "UNKNOWN",
  ])
  return { temperatureC, humidityPct, health, readAt }
}
