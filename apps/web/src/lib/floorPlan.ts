import { api } from "./api"
import type { Metered } from "./capacity"

// Floor-plan client model (DCIM_DESIGN_BRIEF §6). Mirrors the floor-plan API.

export type FloorPlanRoom = {
  id: string; name: string
  widthMm: number | null; depthMm: number | null
  gridCols: number | null; gridRows: number | null
  shellType: string | null; backgroundOpacity: number | null
  hasBackgroundImage: boolean; shellShape: any
}
export type FloorHealth = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN"
export type CabinetEnvironment = {
  temperatureC: number | null; humidityPct: number | null; health: FloorHealth; readAt: string | null
}
export type FloorCabinet = {
  id: string; name: string
  posX: number; posY: number; orientation: number; status: string
  widthMm?: number | null; depthMm?: number | null
  row: string | null; positionInRow: number | null; totalU: number
  space: { usedU: number; totalU: number; pct: number; largestContiguousU: number }
  power: Metered; weight: Metered
  stranded: "power" | "space" | null
  environment?: CabinetEnvironment
  activeAssets: number
}
export type UnplacedCabinet = { id: string; name: string; totalU: number; status: string }
export type FloorObjectT = {
  id: string; objectType: string; posX: number; posY: number
  width: number | null; depth: number | null; orientation: number; label: string | null; assetId: string | null
}
export type AisleZoneT = { id: string; type: string; geometry: any; label: string | null }
export type FloorPlan = {
  room: FloorPlanRoom
  cabinets: FloorCabinet[]
  unplacedCabinets: UnplacedCabinet[]
  floorObjects: FloorObjectT[]
  aisleZones: AisleZoneT[]
}

export type FloorLens = "space" | "power" | "status" | "health"

export async function getFloorPlan(roomId: string): Promise<FloorPlan> {
  return (await api.get<FloorPlan>(`/rooms/${roomId}/floor-plan`)).data
}
export async function placeCabinet(cabinetId: string, dto: {
  posX?: number | null; posY?: number | null; orientation?: number; status?: string; row?: string | null; positionInRow?: number | null
}) {
  return (await api.patch(`/cabinets/${cabinetId}/placement`, dto)).data
}
export async function updateRoomSettings(roomId: string, dto: {
  widthMm?: number | null; depthMm?: number | null; gridCols?: number | null; gridRows?: number | null; shellType?: string | null; backgroundOpacity?: number | null
}) {
  return (await api.patch(`/rooms/${roomId}/floor-plan/settings`, dto)).data
}
export async function createFloorObject(roomId: string, dto: {
  objectType: string; posX: number; posY: number; label?: string
}) {
  return (await api.post(`/rooms/${roomId}/floor-objects`, dto)).data
}
export async function deleteFloorObject(roomId: string, id: string) {
  await api.delete(`/rooms/${roomId}/floor-objects/${id}`)
}
export async function createAisleZone(roomId: string, dto: { type: string; geometry: any; label?: string }) {
  return (await api.post(`/rooms/${roomId}/aisle-zones`, dto)).data
}
export async function deleteAisleZone(roomId: string, id: string) {
  await api.delete(`/rooms/${roomId}/aisle-zones/${id}`)
}
