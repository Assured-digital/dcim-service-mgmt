import { FloorCabinet } from "../../lib/floorPlan"

// Thermal lens (floor plan Phase B). An interpolated room temperature field from
// the per-cabinet inlet readings — inverse-distance weighting over a coarse grid,
// upscaled by the browser into a smooth heatmap. Absolute ASHRAE-anchored ramp so
// the colour means the same temperature in every room (unlike the relative RAG
// lenses). Derived, never stored — mirrors the health rule.

// °C → RGB along a blue→green→amber→red ramp with ASHRAE breakpoints (recommended
// 18–27, allowable 15–32). Below 15 reads cold-blue, above 34 saturated red.
const STOPS: [number, [number, number, number]][] = [
  [12, [30, 58, 138]],   // deep blue
  [16, [37, 99, 235]],   // blue
  [18, [34, 197, 94]],   // green (recommended floor)
  [24, [34, 197, 94]],   // green
  [27, [234, 179, 8]],   // amber (recommended ceiling)
  [30, [249, 115, 22]],  // orange
  [34, [239, 68, 68]],   // red (past allowable)
]

export function tempRgb(t: number): [number, number, number] {
  if (t <= STOPS[0][0]) return STOPS[0][1]
  if (t >= STOPS[STOPS.length - 1][0]) return STOPS[STOPS.length - 1][1]
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i], [t1, c1] = STOPS[i + 1]
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0)
      return [0, 1, 2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * f)) as [number, number, number]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

export function tempCss(t: number): string {
  const [r, g, b] = tempRgb(t)
  return `rgb(${r},${g},${b})`
}

// The temperature sources = cabinets with a measured inlet, at their grid centre.
export function thermalSources(cabinets: FloorCabinet[]): { x: number; y: number; t: number }[] {
  return cabinets
    .filter(c => c.environment?.temperatureC != null)
    .map(c => ({ x: c.posX + 0.5, y: c.posY + 0.5, t: c.environment!.temperatureC as number }))
}

// Build a smooth heatmap as a data URL sized to the room grid. Returns null when
// there are no readings to interpolate. `sub` = samples per grid cell.
export function buildThermalDataUrl(cabinets: FloorCabinet[], cols: number, rows: number, sub = 4): string | null {
  const src = thermalSources(cabinets)
  if (src.length === 0) return null
  const w = Math.max(2, cols * sub), h = Math.max(2, rows * sub)
  const canvas = document.createElement("canvas")
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const img = ctx.createImageData(w, h)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // sample position in grid-cell units (cell centres)
      const sx = (px + 0.5) / sub, sy = (py + 0.5) / sub
      let num = 0, den = 0, nearest = Infinity
      for (const s of src) {
        const dx = sx - s.x, dy = sy - s.y
        const d2 = dx * dx + dy * dy
        if (d2 < 1e-6) { num = s.t; den = 1; nearest = 0; break }
        const wgt = 1 / (d2 * d2) // p=4 → tight, sensor-anchored field
        num += s.t * wgt; den += wgt
        if (d2 < nearest) nearest = d2
      }
      const t = den > 0 ? num / den : 20
      const [r, g, b] = tempRgb(t)
      // fade confidence with distance from the nearest sensor (cells) so far
      // corners don't over-claim precision.
      const dist = Math.sqrt(nearest)
      const a = Math.round(255 * Math.max(0.28, Math.min(0.82, 0.82 - dist * 0.09)))
      const o = (py * w + px) * 4
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL("image/png")
}
