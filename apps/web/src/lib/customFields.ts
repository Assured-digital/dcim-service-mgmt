import { api } from "./api"

// Asset custom properties (register power-features). Field definitions are per
// client; values live in Asset.customValues keyed by field.key.
export const CUSTOM_FIELD_TYPES = ["text", "number", "select", "date"] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Text", number: "Number", select: "Choice", date: "Date",
}

export type AssetCustomField = {
  id: string; key: string; label: string; type: CustomFieldType; options: string[]; order: number
}

export async function listCustomFields(): Promise<AssetCustomField[]> {
  return (await api.get<AssetCustomField[]>("/asset-custom-fields")).data
}
export async function createCustomField(dto: { label: string; type: CustomFieldType; options?: string[] }): Promise<AssetCustomField> {
  return (await api.post<AssetCustomField>("/asset-custom-fields", dto)).data
}
export async function updateCustomField(id: string, dto: { label?: string; options?: string[]; order?: number }): Promise<AssetCustomField> {
  return (await api.put<AssetCustomField>(`/asset-custom-fields/${id}`, dto)).data
}
export async function deleteCustomField(id: string): Promise<void> {
  await api.delete(`/asset-custom-fields/${id}`)
}

// Render a stored value for display (dates ISO→local, others as-is).
export function formatCustomValue(field: AssetCustomField, value: unknown): string {
  if (value == null || value === "") return "—"
  if (field.type === "date") { const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString() }
  return String(value)
}
