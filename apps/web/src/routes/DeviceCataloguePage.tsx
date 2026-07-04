import React from "react"
import {
  Box, Button, CircularProgress, Drawer, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import { ListToolbar, SearchField, ToolbarButton } from "../components/shared/ListToolbar"
import UploadIcon from "@mui/icons-material/Upload"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useBreadcrumb } from "./Shell"
import { useNotification } from "../components/NotificationProvider"
import { useThemeMode } from "../lib/theme"
import { semanticToken } from "../components/shared/tokens/colors"
import { hasAnyRole, ROLES } from "../lib/rbac"
import { getApiErrorMessage } from "../lib/infrastructure"
import {
  AIRFLOW_LABELS, DeviceType, deleteDeviceType, fetchDeviceTypeImage,
  formatU, listManufacturers, searchDeviceTypes, uploadDeviceTypeImage,
} from "../lib/deviceTypes"
import { DeviceTypeFormDialog } from "./DeviceTypeFormDialog"

const DEFAULT_DERATE = 60

// Device-type catalogue (DCIM spec §3 / brief §6). Manufacturer rail → device-type
// table (with cross-tenant usage counts) → detail drawer (spec, images, edit,
// delete). The "Catalogue" destination of the DCIM sub-nav.
export default function DeviceCataloguePage() {
  const { setBreadcrumbs, setHideModuleLabel, setPageFullBleed } = useBreadcrumb()
  const { mode } = useThemeMode()
  const { notify } = useNotification()
  const qc = useQueryClient()
  const canManage = hasAnyRole([ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.ADMIN, ROLES.SERVICE_MANAGER])

  const [mfrId, setMfrId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState<"new" | DeviceType | null>(null)

  React.useEffect(() => {
    setHideModuleLabel(true); setPageFullBleed(true); setBreadcrumbs([{ label: "Device catalogue" }])
    return () => { setHideModuleLabel(false); setPageFullBleed(false) }
  }, [setHideModuleLabel, setPageFullBleed, setBreadcrumbs])

  const { data: manufacturers = [] } = useQuery({ queryKey: ["manufacturers"], queryFn: listManufacturers })
  const { data: types = [], isFetching } = useQuery({
    queryKey: ["device-types", "catalogue", mfrId, debounced],
    queryFn: () => searchDeviceTypes(debounced || undefined, mfrId ?? undefined),
  })

  const selected = types.find(t => t.id === selectedId) ?? null
  const totalTypes = manufacturers.reduce((s, m) => s + m._count.deviceTypes, 0)

  async function handleDelete(dt: DeviceType) {
    try {
      await deleteDeviceType(dt.id)
      notify.success("Device type deleted")
      setSelectedId(null)
      qc.invalidateQueries({ queryKey: ["device-types"] })
      qc.invalidateQueries({ queryKey: ["manufacturers"] })
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to delete device type"))
    }
  }

  const railBg = mode === "dark" ? "#111c30" : "#ffffff"

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <ListToolbar>
        <SearchField placeholder="Search model or manufacturer…" value={search} onValueChange={setSearch} onSearch={q => setDebounced(q)} />
        {isFetching ? <CircularProgress size={16} /> : null}
        <Box sx={{ flex: 1 }} />
        {canManage ? <ToolbarButton variant="primary" startIcon={<AddIcon sx={{ fontSize: "15px !important" }} />} onClick={() => setFormOpen("new")}>New device type</ToolbarButton> : null}
      </ListToolbar>

      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Manufacturer rail */}
        <Box sx={{ width: 190, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", bgcolor: railBg, overflowY: "auto", py: "8px" }}>
          <Typography sx={{ px: "14px", py: "6px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" }}>Manufacturers</Typography>
          <RailRow label="All manufacturers" count={totalTypes} active={mfrId === null} onClick={() => setMfrId(null)} />
          {manufacturers.map(m => (
            <RailRow key={m.id} label={m.name} count={m._count.deviceTypes} active={mfrId === m.id} onClick={() => setMfrId(m.id)} />
          ))}
        </Box>

        {/* Table */}
        <Box sx={{ flex: 1, overflow: "auto" }}>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Model</TableCell>
                  <TableCell>Part no.</TableCell>
                  <TableCell align="right">U</TableCell>
                  <TableCell align="right">W</TableCell>
                  <TableCell align="right">kg</TableCell>
                  <TableCell>Airflow</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">In use</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {types.map(t => (
                  <TableRow key={t.id} hover selected={t.id === selectedId} onClick={() => setSelectedId(t.id)} sx={{ cursor: "pointer" }}>
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Box>
                          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{t.model}</Typography>
                          <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{t.manufacturer.name}</Typography>
                        </Box>
                        {t.isSeeded ? <MiniBadge intent="neutral" label="seeded" mode={mode} /> : null}
                        {t.excludeFromUtilization ? <MiniBadge intent="warning" label="excl. fill" mode={mode} /> : null}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ fontSize: 11.5, color: "text.secondary" }}>{t.partNumber ?? "—"}</TableCell>
                    <TableCell align="right">{t.uHeight != null ? formatU(t.uHeight) : "—"}</TableCell>
                    <TableCell align="right">{t.powerDrawW != null ? t.powerDrawW.toLocaleString() : "—"}</TableCell>
                    <TableCell align="right">{t.weightKg != null ? t.weightKg : "—"}</TableCell>
                    <TableCell sx={{ fontSize: 11.5, color: "text.secondary" }}>{t.airflow ? AIRFLOW_LABELS[t.airflow] : "—"}</TableCell>
                    <TableCell sx={{ fontSize: 11.5 }}>{t.category ?? "—"}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: t._count?.assets ? 600 : 400, color: t._count?.assets ? "text.primary" : "text.secondary" }}>{t._count?.assets ?? 0}</TableCell>
                  </TableRow>
                ))}
                {types.length === 0 && !isFetching ? (
                  <TableRow><TableCell colSpan={8} sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>No device types match.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>

      {/* Detail drawer */}
      <Drawer anchor="right" open={!!selected} onClose={() => setSelectedId(null)} PaperProps={{ sx: { width: 400, p: 2.5 } }}>
        {selected ? (
          <DetailContent dt={selected} canManage={canManage} onEdit={() => setFormOpen(selected)} onDelete={() => handleDelete(selected)}
            onImageChanged={() => qc.invalidateQueries({ queryKey: ["device-types"] })} />
        ) : null}
      </Drawer>

      {formOpen ? (
        <DeviceTypeFormDialog existing={formOpen === "new" ? null : formOpen}
          onClose={() => setFormOpen(null)}
          onSaved={(dt) => { setSelectedId(dt.id); qc.invalidateQueries({ queryKey: ["device-types"] }); qc.invalidateQueries({ queryKey: ["manufacturers"] }) }} />
      ) : null}
    </Box>
  )
}

function RailRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <Box onClick={onClick} sx={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
      px: "14px", py: "7px", cursor: "pointer",
      borderRight: active ? "2px solid" : "2px solid transparent", borderColor: active ? "primary.main" : "transparent",
      bgcolor: active ? (t => t.palette.mode === "dark" ? "rgba(59,130,246,0.14)" : "#eff6ff") : "transparent",
      "&:hover": { bgcolor: active ? undefined : "action.hover" }
    }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: active ? 700 : 400, color: active ? "primary.main" : "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Typography>
      <Typography sx={{ fontSize: 11, color: "text.secondary", flexShrink: 0 }}>{count}</Typography>
    </Box>
  )
}

function MiniBadge({ intent, label, mode }: { intent: "neutral" | "warning"; label: string; mode: "light" | "dark" }) {
  const tok = semanticToken(intent, mode)
  return <Box sx={{ px: "6px", py: "1px", borderRadius: "999px", bgcolor: tok.bg, flexShrink: 0 }}><Typography sx={{ fontSize: 9.5, fontWeight: 600, color: tok.text }}>{label}</Typography></Box>
}

function DetailContent({ dt, canManage, onEdit, onDelete, onImageChanged }: {
  dt: DeviceType; canManage: boolean; onEdit: () => void; onDelete: () => void; onImageChanged: () => void
}) {
  const inUse = dt._count?.assets ?? 0
  const derate = dt.deratePct ?? DEFAULT_DERATE
  const budgeted = dt.powerDrawW != null ? Math.round(dt.powerDrawW * derate / 100) : null
  const rows: [string, string][] = [
    ["U height", dt.uHeight != null ? `${formatU(dt.uHeight)} · ${dt.isFullDepth === false ? "half depth" : "full depth"}` : "—"],
    ["Nameplate", dt.powerDrawW != null ? `${dt.powerDrawW.toLocaleString()} W` : "—"],
    ["Budgeted", budgeted != null ? `${derate}% → ${budgeted.toLocaleString()} W` : "—"],
    ["Weight", dt.weightKg != null ? `${dt.weightKg} kg` : "—"],
    ["Airflow", dt.airflow ? AIRFLOW_LABELS[dt.airflow] : "—"],
    ["Part number", dt.partNumber ?? "—"],
    ["Counts toward fill %", dt.excludeFromUtilization ? "No (excluded)" : "Yes"],
  ]
  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{dt.model}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{dt.manufacturer.name}{dt.category ? ` · ${dt.category}` : ""}{dt.isSeeded ? " · seeded" : ""}</Typography>
      </Box>

      <Stack direction="row" spacing={1.5}>
        <ImageFace dt={dt} face="front" canManage={canManage} onChanged={onImageChanged} />
        <ImageFace dt={dt} face="rear" canManage={canManage} onChanged={onImageChanged} />
      </Stack>

      <Box>
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: "flex", justifyContent: "space-between", py: "5px", borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{label}</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 12.5 }}>Used by <b>{inUse}</b> asset{inUse === 1 ? "" : "s"}</Typography>
      </Box>

      {canManage ? (
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={onEdit} sx={{ textTransform: "none" }}>Edit</Button>
          {inUse > 0 ? (
            <Typography sx={{ fontSize: 11.5, color: "text.secondary", alignSelf: "center" }}>In use — cannot delete</Typography>
          ) : (
            <Button size="small" variant="outlined" color="error" onClick={onDelete} sx={{ textTransform: "none" }}>Delete</Button>
          )}
        </Stack>
      ) : null}
    </Stack>
  )
}

// Front/rear image: fetches WITH auth (blob → object URL) when a key exists;
// managers can upload/replace (validated raster only, server-side).
function ImageFace({ dt, face, canManage, onChanged }: {
  dt: DeviceType; face: "front" | "rear"; canManage: boolean; onChanged: () => void
}) {
  const { notify } = useNotification()
  const hasImage = face === "front" ? !!dt.frontImageKey : !!dt.rearImageKey
  const [url, setUrl] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let revoke: string | null = null
    if (hasImage) {
      fetchDeviceTypeImage(dt.id, face).then(u => { revoke = u; setUrl(u) }).catch(() => setUrl(null))
    } else setUrl(null)
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [dt.id, face, hasImage, dt.frontImageType, dt.rearImageType])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true)
    try { await uploadDeviceTypeImage(dt.id, face, file); notify.success(`${face === "front" ? "Front" : "Rear"} image updated`); onChanged() }
    catch (err: unknown) { notify.error(getApiErrorMessage((err as any)?.response?.data ?? err, "Upload failed")) }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = "" }
  }

  return (
    <Box sx={{ flex: 1 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary", mb: "4px" }}>{face}</Typography>
      <Box sx={{ height: 60, borderRadius: "6px", border: "1px dashed", borderColor: "divider", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
        {url ? <img src={url} alt={`${face} of ${dt.model}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          : <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>No image</Typography>}
        {busy ? <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.3)" }}><CircularProgress size={16} /></Box> : null}
      </Box>
      {canManage ? (
        <>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={onFile} />
          <Button size="small" startIcon={<UploadIcon sx={{ fontSize: 14 }} />} onClick={() => inputRef.current?.click()} sx={{ mt: "4px", fontSize: 11, textTransform: "none", minWidth: 0 }}>
            {url ? "Replace" : "Upload"}
          </Button>
        </>
      ) : null}
    </Box>
  )
}
