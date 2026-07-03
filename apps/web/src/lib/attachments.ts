import { api, type ApiError } from "./api"
import type { LinkRecordType } from "./linkedRecords"

// Metadata for one attachment, mirroring the backend's resolved projection
// ({ id, filename, contentType, size, uploadedAt, inline }, newest-first). `inline`
// is the server's authoritative "safe to render in-browser" flag (PDF + raster
// images today); the preview modal uses it to choose preview vs download-fallback.
export interface AttachmentSummary {
  id: string
  filename: string
  contentType: string
  size: number
  caption: string | null // optional short evidence label; null when none set
  uploadedAt: string
  inline: boolean
}

// The record an attachment hangs off — the six work-item link types PLUS `maintenance`,
// `check` and `check-item` (a line-item on a check, carrying per-item field-evidence
// photos), PLUS the DCIM estate entities (`asset`/`cabinet`/`site` — datasheets,
// install photos, room documents). All the extras are attachable but NOT linkable
// (decoupled from the link union).
// Mirrors the backend `ATTACHMENT_RECORD_TYPES` contract (the on-the-wire `recordType`).
export type AttachmentRecordType = LinkRecordType | "maintenance" | "check" | "check-item" | "asset" | "cabinet" | "site"

export function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/")
}

export function isPdf(contentType: string): boolean {
  return contentType === "application/pdf"
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

// ── API helpers (auth + x-client-id auto-injected by the api interceptor) ──────

export async function uploadAttachment(
  recordType: AttachmentRecordType,
  recordId: string,
  file: File,
  caption?: string | null
): Promise<AttachmentSummary> {
  const fd = new FormData()
  fd.append("file", file)
  fd.append("recordType", recordType)
  fd.append("recordId", recordId)
  // Caption rides along with the upload (frictionless capture). Only send a non-blank
  // value; absent => stored NULL by the backend.
  if (caption && caption.trim()) fd.append("caption", caption.trim())
  // Let axios set the multipart boundary; do NOT set Content-Type manually.
  const { data } = await api.post<AttachmentSummary>("/attachments", fd)
  return data
}

// Edit the caption of an existing attachment. A blank caption clears it. Rejected by
// the backend (400) if the owning check is COMPLETED/CLOSED (evidence lock).
export async function updateAttachmentCaption(
  id: string,
  caption: string
): Promise<AttachmentSummary> {
  const { data } = await api.patch<AttachmentSummary>(`/attachments/${id}`, {
    caption: caption.trim() || undefined,
  })
  return data
}

// Fetch the bytes through the authenticated api client (the GET endpoint requires
// the auth header + x-client-id and re-checks tenant scope — a raw <img>/<iframe>
// src would be rejected). Caller is responsible for revoking any object URL it makes.
export async function fetchAttachmentBlob(id: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/attachments/${id}`, { responseType: "blob" })
  return data
}

// Download via the api client (auth) then trigger a browser save. The backend sets
// Content-Disposition; here we just need authenticated bytes + a save.
export async function downloadAttachment(att: AttachmentSummary): Promise<void> {
  const blob = await fetchAttachmentBlob(att.id)
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = att.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export async function deleteAttachment(id: string): Promise<void> {
  await api.delete(`/attachments/${id}`)
}

// Turn a (normalised) API error into a friendly, user-facing message — never a raw
// 413/415. The api response interceptor rejects with ApiError { statusCode, message }.
export function attachmentErrorMessage(err: unknown): string {
  const e = err as Partial<ApiError> | undefined
  if (e?.statusCode === 413) return "File is too large (max 25 MB)."
  if (e?.statusCode === 415) return "Only PDF and images (PNG, JPEG, GIF, WebP) are allowed."
  const msg = e?.message
  if (typeof msg === "string") return msg
  if (Array.isArray(msg)) return msg.join(", ")
  return "Upload failed."
}
