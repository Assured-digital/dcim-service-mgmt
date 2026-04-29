import { Injectable, Logger } from "@nestjs/common"

export type GeocodeQuery = {
  address?: string | null
  city?: string | null
  postcode?: string | null
  country?: string | null
}

export type GeocodeResult = { lat: number; lon: number }

const MAX_CACHE_ENTRIES = 200
const MIN_REQUEST_INTERVAL_MS = 1_000

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name)
  private readonly baseUrl = process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org"
  private readonly userAgent = process.env.GEOCODER_USER_AGENT ?? "dcim-service-mgmt/1.0 (ops@assured.digital)"
  private readonly cache = new Map<string, GeocodeResult | null>()
  private lastRequestAt = 0
  private queue: Promise<unknown> = Promise.resolve()

  async geocodeAddress(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const q = this.buildQuery(query)
    if (!q) return null

    if (this.cache.has(q)) {
      return this.cache.get(q) ?? null
    }

    return this.enqueue(() => this.fetchFromNominatim(q))
  }

  private buildQuery(query: GeocodeQuery): string {
    const parts = [query.address, query.city, query.postcode, query.country]
      .map(v => (v ?? "").trim())
      .filter(Boolean)
    if (parts.length === 0) return ""
    return parts.join(", ")
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const wait = Math.max(0, this.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now())
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      this.lastRequestAt = Date.now()
      return task()
    })
    this.queue = next.catch(() => undefined)
    return next
  }

  private async fetchFromNominatim(q: string): Promise<GeocodeResult | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/search?format=json&limit=1&q=${encodeURIComponent(q)}`
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept": "application/json",
          "Accept-Language": "en"
        }
      })
      if (!res.ok) {
        this.logger.warn(`Geocoder returned ${res.status} for "${q}"`)
        this.remember(q, null)
        return null
      }
      const body = (await res.json()) as Array<{ lat: string; lon: string }>
      if (!Array.isArray(body) || body.length === 0) {
        this.remember(q, null)
        return null
      }
      const lat = parseFloat(body[0].lat)
      const lon = parseFloat(body[0].lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        this.remember(q, null)
        return null
      }
      const result: GeocodeResult = { lat, lon }
      this.remember(q, result)
      return result
    } catch (err) {
      this.logger.warn(`Geocoder error for "${q}": ${(err as Error).message}`)
      return null
    }
  }

  private remember(key: string, value: GeocodeResult | null) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, value)
  }
}
