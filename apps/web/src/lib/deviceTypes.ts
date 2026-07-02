import { api } from "./api"

// Hardware catalogue types — mirror the API's device-types responses (the global,
// non-tenant-scoped catalogue). Manufacturer is inlined on each device type.

export type Manufacturer = {
  id: string
  name: string
  slug: string
}

export type ManufacturerWithCount = Manufacturer & {
  _count: { deviceTypes: number }
}

export type DeviceAirflow = "FRONT_TO_REAR" | "REAR_TO_FRONT" | "SIDE_TO_REAR" | "PASSIVE" | "MIXED"

export const AIRFLOW_LABELS: Record<DeviceAirflow, string> = {
  FRONT_TO_REAR: "Front to rear",
  REAR_TO_FRONT: "Rear to front",
  SIDE_TO_REAR: "Side to rear",
  PASSIVE: "Passive",
  MIXED: "Mixed",
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
  weightKg: number | null
  airflow: DeviceAirflow | null
  category: string | null
  excludeFromUtilization: boolean
  deratePct: number | null
  frontImageKey: string | null
  frontImageType: string | null
  rearImageKey: string | null
  rearImageType: string | null
  isSeeded: boolean
  createdAt: string
  updatedAt?: string
  // Present on list/detail responses — cross-tenant usage count (internal only).
  _count?: { assets: number }
}

export type CreateDeviceTypeInput = {
  manufacturerId?: string
  manufacturerName?: string
  model: string
  uHeight?: number
  isFullDepth?: boolean
  powerDrawW?: number
  partNumber?: string
  weightKg?: number
  airflow?: DeviceAirflow
  category?: string
  excludeFromUtilization?: boolean
  deratePct?: number
}

export type UpdateDeviceTypeInput = Partial<{
  model: string
  uHeight: number | null
  isFullDepth: boolean
  powerDrawW: number | null
  partNumber: string | null
  weightKg: number | null
  airflow: DeviceAirflow | null
  category: string | null
  excludeFromUtilization: boolean
  deratePct: number | null
}>

// GET /device-types?search=&manufacturerId= — flat list, manufacturer inlined.
export async function searchDeviceTypes(search?: string, manufacturerId?: string): Promise<DeviceType[]> {
  const res = await api.get<DeviceType[]>("/device-types", {
    params: { ...(search ? { search } : {}), ...(manufacturerId ? { manufacturerId } : {}) },
  })
  return res.data
}

// GET /manufacturers — the rail, each with its device-type count.
export async function listManufacturers(): Promise<ManufacturerWithCount[]> {
  const res = await api.get<ManufacturerWithCount[]>("/manufacturers")
  return res.data
}

export async function getDeviceType(id: string): Promise<DeviceType> {
  const res = await api.get<DeviceType>(`/device-types/${id}`)
  return res.data
}

export async function createDeviceType(input: CreateDeviceTypeInput): Promise<DeviceType> {
  const res = await api.post<DeviceType>("/device-types", input)
  return res.data
}

export async function updateDeviceType(id: string, patch: UpdateDeviceTypeInput): Promise<DeviceType> {
  const res = await api.patch<DeviceType>(`/device-types/${id}`, patch)
  return res.data
}

export async function deleteDeviceType(id: string): Promise<void> {
  await api.delete(`/device-types/${id}`)
}

// Fetch a device-type image WITH auth as a blob → object URL (the endpoint needs
// the bearer token, so a raw <img src> can't be used — same posture as attachments).
export async function fetchDeviceTypeImage(id: string, face: "front" | "rear"): Promise<string> {
  const res = await api.get(`/device-types/${id}/images/${face}`, { responseType: "blob" })
  return URL.createObjectURL(res.data as Blob)
}

// PUT a front/rear image (multipart). Returns the updated device type.
export async function uploadDeviceTypeImage(id: string, face: "front" | "rear", file: File): Promise<DeviceType> {
  const form = new FormData()
  form.append("file", file)
  const res = await api.put<DeviceType>(`/device-types/${id}/images/${face}`, form)
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
