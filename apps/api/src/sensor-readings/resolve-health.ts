import { PrismaService } from "../prisma/prisma.service"
import {
  Health, LatestByAsset, humidityHealth, isSensorMetric, powerHealth, temperatureHealth, worstHealth,
} from "./health"

// Derived per-asset health (Horizon 3). Follows the "resolver helper" pattern
// (resolve-attachments): given (prisma, clientId, assets), it batches the latest
// readings and derives health WITHOUT storing it — the §6b "derived, never
// stored" rule. Spread onto asset reads so the register/detail can show health
// as a first-class facet while the source of truth stays the readings.

export type AssetHealth = {
  health: Health
  temperatureC: number | null
  humidityPct: number | null
  powerW: number | null
  readAt: string | null
}

const UNMONITORED: AssetHealth = { health: "UNKNOWN", temperatureC: null, humidityPct: null, powerW: null, readAt: null }

// budgetedDrawW gives the per-asset power ceiling (measured W vs budget) — the
// same three-number capacity model the cabinet roll-up uses, per asset.
export async function resolveHealthForAssets(
  prisma: PrismaService,
  clientId: string,
  assets: { id: string; budgetedDrawW: number | null }[],
): Promise<Map<string, AssetHealth>> {
  const out = new Map<string, AssetHealth>()
  const ids = assets.map((a) => a.id)
  if (ids.length === 0) return out

  // Latest reading per (asset, metric) — mirrors SensorReadingsService.latestForAssets
  // (replicated here to keep the resolver free of a service dependency).
  const rows = await prisma.sensorReading.findMany({
    where: { clientId, assetId: { in: ids } },
    orderBy: [{ assetId: "asc" }, { metric: "asc" }, { readAt: "desc" }],
    distinct: ["assetId", "metric"],
    select: { assetId: true, metric: true, value: true, readAt: true },
  })
  const latest: LatestByAsset = new Map()
  for (const r of rows) {
    if (!isSensorMetric(r.metric)) continue
    const m = latest.get(r.assetId) ?? {}
    m[r.metric] = { value: r.value, readAt: r.readAt.toISOString() }
    latest.set(r.assetId, m)
  }

  for (const asset of assets) {
    const m = latest.get(asset.id)
    if (!m) { out.set(asset.id, UNMONITORED); continue }
    const temperatureC = m.temperatureC?.value ?? null
    const humidityPct = m.humidityPct?.value ?? null
    const powerW = m.powerW?.value ?? null
    const budgetedKw = asset.budgetedDrawW != null ? asset.budgetedDrawW / 1000 : null
    const health = worstHealth([
      temperatureC != null ? temperatureHealth(temperatureC) : "UNKNOWN",
      humidityPct != null ? humidityHealth(humidityPct) : "UNKNOWN",
      powerW != null ? powerHealth(powerW / 1000, budgetedKw) : "UNKNOWN",
    ])
    const readAt = [m.temperatureC?.readAt, m.humidityPct?.readAt, m.powerW?.readAt]
      .filter((v): v is string => !!v).sort().at(-1) ?? null
    out.set(asset.id, { health, temperatureC, humidityPct, powerW, readAt })
  }
  return out
}
