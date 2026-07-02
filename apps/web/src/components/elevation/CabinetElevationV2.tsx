import React from "react"
import { Box, Button, Stack, Typography } from "@mui/material"
import { api } from "../../lib/api"
import { useNotification } from "../NotificationProvider"
import { useThemeMode } from "../../lib/theme"
import { semanticToken } from "../shared/tokens/colors"
import {
  Cabinet, CabinetReservation, ElevationSide,
  assetSlotText, getApiErrorMessage
} from "../../lib/infrastructure"
import { ElevationEntry, computeMoveTargets, useElevationModel } from "./useElevationModel"
import { ElevationAssetSlot } from "./ElevationAssetSlot"
import { ElevationEmptySlot } from "./ElevationEmptySlot"
import { ReservationBlock } from "./ReservationBlock"
import { ZeroUTray } from "./ZeroUTray"
import { RACK_U_HEIGHT } from "./constants"

// Cabinet elevation v2 (DCIM spec §2). A2 = the render; A3 adds the
// interactions: click-empty-U-to-add (prefilled dialog), click-to-move with
// valid/reserved/invalid target painting + confirm chip + the advisory-409
// "place anyway" flow, and reservation create/edit via the blocks.

type PendingMove = { u: number; face: ElevationSide; reservation?: CabinetReservation }

function Face({
  label, entries, startingUnit, totalU, selectedAssetId, onSelectAsset,
  canAdd, onAddAt, targets, onPickTarget, onEditReservation
}: {
  label: ElevationSide; entries: ElevationEntry[]; startingUnit: number; totalU: number
  selectedAssetId: string | null; onSelectAsset: (id: string) => void
  canAdd: boolean
  onAddAt: ((u: number, face: ElevationSide) => void) | null
  targets: Map<number, { state: "valid" | "reserved" | "invalid"; reservation?: CabinetReservation }> | null
  onPickTarget: (u: number, face: ElevationSide) => void
  onEditReservation: ((r: CabinetReservation) => void) | null
}) {
  const { mode } = useThemeMode()
  const isDark = mode === "dark"
  const text = assetSlotText(mode)

  const uNumbers = React.useMemo(() => {
    const nums: React.ReactElement[] = []
    for (let u = startingUnit + totalU - 1; u >= startingUnit; u--) {
      nums.push(
        <Box key={u} sx={{ height: RACK_U_HEIGHT, display: "flex", alignItems: "center", justifyContent: "flex-end", pr: "5px", fontSize: 9, fontFamily: "monospace", color: text.subtitle, fontWeight: 600 }}>{u}</Box>
      )
    }
    return nums
  }, [startingUnit, totalU, text.subtitle])

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: text.subtitle, mb: "4px" }}>{label}</Typography>
      <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <Box sx={{ width: 26, flexShrink: 0, pt: "8px" }}>{uNumbers}</Box>
        <Box sx={{
          flex: 1, borderRadius: "5px", p: "6px",
          border: `2.5px solid ${isDark ? "#475569" : "#1e293b"}`,
          bgcolor: isDark ? "#0b1220" : "#f8fafc"
        }}>
          {entries.map(entry => {
            if (entry.kind === "empty") {
              return (
                <ElevationEmptySlot
                  key={`e${entry.u}`} u={entry.u}
                  canAdd={canAdd && !!onAddAt && !targets}
                  target={targets ? (targets.get(entry.u)?.state ?? "invalid") : null}
                  onAdd={(u) => onAddAt?.(u, label)}
                  onPickTarget={(u) => onPickTarget(u, label)}
                />
              )
            }
            if (entry.kind === "reservation") {
              // In move mode the reservation range IS a pickable (advisory)
              // target — clicking it drives the "place anyway" confirm.
              const clickable = targets ? true : !!onEditReservation
              return (
                <Box key={`r${entry.reservation.id}`}
                  onClick={() => targets ? onPickTarget(entry.reservation.uStart, label) : onEditReservation?.(entry.reservation)}
                  sx={clickable ? { cursor: "pointer" } : undefined}
                >
                  <ReservationBlock reservation={entry.reservation} h={entry.h} />
                </Box>
              )
            }
            return (
              <ElevationAssetSlot
                key={`a${entry.asset.id}${entry.ghost ? "-ghost" : ""}`}
                asset={entry.asset} h={entry.h} ghost={entry.ghost}
                isSelected={selectedAssetId === entry.asset.id} onSelect={onSelectAsset}
              />
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}

export const CabinetElevationV2 = React.memo(function CabinetElevationV2({
  cabinet, sides, selectedAssetId, onSelectAsset,
  canManage = false, moveAssetId = null, onEndMove, onAddAssetAt, onEditReservation, onDataChanged
}: {
  cabinet: Cabinet
  sides: ElevationSide | "BOTH"
  selectedAssetId: string | null
  onSelectAsset: (id: string) => void
  canManage?: boolean
  moveAssetId?: string | null
  onEndMove?: () => void
  onAddAssetAt?: (u: number, face: ElevationSide) => void
  onEditReservation?: (r: CabinetReservation | null) => void
  onDataChanged?: () => void
}) {
  const { notify } = useNotification()
  const { mode } = useThemeMode()
  const model = useElevationModel(cabinet)
  const shown: ElevationSide[] = sides === "BOTH" ? ["FRONT", "REAR"] : [sides]

  const [pending, setPending] = React.useState<PendingMove | null>(null)
  const [saving, setSaving] = React.useState(false)

  const moveAsset = React.useMemo(
    () => (moveAssetId ? cabinet.assets.find(a => a.id === moveAssetId) ?? null : null),
    [cabinet.assets, moveAssetId]
  )
  React.useEffect(() => { setPending(null) }, [moveAssetId, cabinet])

  const targets = React.useMemo(
    () => (moveAsset ? computeMoveTargets(cabinet, moveAsset) : null),
    [cabinet, moveAsset]
  )

  const handlePickTarget = React.useCallback((u: number, face: ElevationSide) => {
    const t = targets?.[face].get(u)
    if (!t || t.state === "invalid") return
    setPending({ u, face, reservation: t.reservation })
  }, [targets])

  async function commitMove() {
    if (!moveAsset || !pending) return
    setSaving(true)
    try {
      await api.put(`/assets/${moveAsset.id}`, {
        uPosition: pending.u,
        rackSide: pending.face,
        ...(pending.reservation ? { overrideReservationId: pending.reservation.id } : {})
      })
      notify.success(`${moveAsset.name} moved to U${pending.u} ${pending.face.toLowerCase()}`)
      onDataChanged?.(); onEndMove?.()
    } catch (e: any) {
      // Advisory-reservation race (spec §2.2): someone reserved this range since
      // the model loaded — surface the blocker and offer place-anyway.
      const res = e?.response?.status === 409 ? e.response.data?.reservation : null
      if (res) setPending(p => (p ? { ...p, reservation: res } : p))
      else notify.error(getApiErrorMessage(e?.response?.data ?? e, "Failed to move asset"))
    } finally { setSaving(false) }
  }

  const warn = semanticToken("warning", mode)
  const moveChip = moveAsset ? (
    <Box sx={{
      mb: "10px", px: "12px", py: "7px", borderRadius: "6px",
      bgcolor: mode === "dark" ? "#172033" : "#0d1526",
      display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"
    }}>
      <Typography sx={{ fontSize: 12, color: "#cbd5e1", flex: 1, minWidth: 180 }}>
        {pending ? (
          pending.reservation ? (
            <>U{pending.u} {pending.face.toLowerCase()} is reserved for <Box component="span" sx={{ color: warn.solid, fontWeight: 700 }}>{pending.reservation.name}</Box> — place anyway?</>
          ) : (
            <>Move <Box component="span" sx={{ color: "#fff", fontWeight: 700 }}>{moveAsset.name}</Box> to <Box component="span" sx={{ color: "#fff", fontWeight: 700 }}>U{pending.u} {pending.face.toLowerCase()}</Box>?</>
          )
        ) : (
          <>Moving <Box component="span" sx={{ color: "#fff", fontWeight: 700 }}>{moveAsset.name}</Box> — pick a highlighted slot</>
        )}
      </Typography>
      {pending ? (
        <Button size="small" disabled={saving} onClick={commitMove}
          sx={{ textTransform: "none", fontSize: 11, fontWeight: 700, px: "12px", py: "2px", borderRadius: "999px", bgcolor: pending.reservation ? "#fef3c7" : "#dcfce7", color: pending.reservation ? "#b45309" : "#15803d", "&:hover": { bgcolor: pending.reservation ? "#fde68a" : "#bbf7d0" } }}>
          {pending.reservation ? "Place anyway" : "Confirm"}
        </Button>
      ) : null}
      <Button size="small" disabled={saving} onClick={() => { setPending(null); onEndMove?.() }}
        sx={{ textTransform: "none", fontSize: 11, fontWeight: 600, px: "12px", py: "2px", borderRadius: "999px", bgcolor: "#334155", color: "#cbd5e1", "&:hover": { bgcolor: "#475569" } }}>
        Cancel
      </Button>
    </Box>
  ) : null

  return (
    <Box>
      {moveChip}
      <Stack direction="row" spacing={1.75}>
        {shown.map(face => (
          <Face
            key={face}
            label={face}
            entries={model.faces[face]}
            startingUnit={model.startingUnit}
            totalU={model.totalU}
            selectedAssetId={selectedAssetId}
            onSelectAsset={onSelectAsset}
            canAdd={canManage}
            onAddAt={onAddAssetAt ?? null}
            targets={targets ? targets[face] : null}
            onPickTarget={handlePickTarget}
            onEditReservation={canManage && onEditReservation ? onEditReservation : null}
          />
        ))}
      </Stack>
      <ZeroUTray
        zeroUAssets={model.zeroUAssets}
        unplacedAssets={model.unplacedAssets}
        selectedAssetId={selectedAssetId}
        onSelectAsset={onSelectAsset}
      />
    </Box>
  )
})

export default CabinetElevationV2
