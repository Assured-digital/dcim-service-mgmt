import { api } from "./api"

// Hardware catalogue types — mirror the API's device-types responses (the global,
// non-tenant-scoped catalogue). Manufacturer is inlined on each device type.

export type Manufacturer = {
  id: string
  name: string
  slug: string
}

export type DeviceType = {
  id: string
  manufacturerId: string
  manufacturer: Manufacturer
  model: string
  slug: string
  uHeight: number | null
  isFullDepth: boolean | null
  powerDrawW: number | null
  partNumber: string | null
  isSeeded: boolean
  createdAt: string
}

export type CreateDeviceTypeInput = {
  manufacturerId?: string
  manufacturerName?: string
  model: string
  uHeight?: number
  isFullDepth?: boolean
  powerDrawW?: number
  partNumber?: string
}

// GET /device-types?search= — flat list, manufacturer inlined, sorted mfr-then-model.
export async function searchDeviceTypes(search?: string): Promise<DeviceType[]> {
  const res = await api.get<DeviceType[]>("/device-types", {
    params: search ? { search } : undefined,
  })
  return res.data
}

// POST /device-types — manual creation. Throws the normalised ApiError (with the
// duplicate 400 message) so callers can surface it.
export async function createDeviceType(input: CreateDeviceTypeInput): Promise<DeviceType> {
  const res = await api.post<DeviceType>("/device-types", input)
  return res.data
}

// Compact one-line spec summary for a device type row — "2U · 750 W" etc.
export function deviceTypeSpecLine(dt: DeviceType): string {
  const parts: string[] = []
  if (dt.uHeight != null) parts.push(formatU(dt.uHeight))
  if (dt.powerDrawW != null) parts.push(`${dt.powerDrawW} W`)
  return parts.join(" · ")
}

// U-height reads "0.5U" / "1U" / "2U"; a 0U device (e.g. a rack PDU) reads "0U".
export function formatU(u: number): string {
  return `${Number.isInteger(u) ? u : u.toFixed(1)}U`
}
