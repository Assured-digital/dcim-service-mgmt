import React from "react"
import { Box } from "@mui/material"
import { api } from "../../lib/api"
import { useThemeMode } from "../../lib/theme"
import { pctColor } from "../../lib/capacity"
import { entityStatusIntent, semanticToken } from "../shared/tokens/colors"
import { FloorCabinet, FloorLens, FloorObjectT, AisleZoneT, FloorPlan } from "../../lib/floorPlan"

// Auth-fetched plan-image backdrop (the endpoint needs the bearer token, so a
// raw <image href> can't be used — same posture as attachments).
function useBackgroundImage(roomId: string, hasImage: boolean): string | null {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    let revoke: string | null = null
    if (hasImage) {
      api.get(`/rooms/${roomId}/floor-plan/background`, { responseType: "blob" })
        .then(res => { revoke = URL.createObjectURL(res.data as Blob); setUrl(revoke) })
        .catch(() => setUrl(null))
    } else setUrl(null)
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [roomId, hasImage])
  return url
}

const CELL = 38

// The architectural room canvas (DCIM_DESIGN_BRIEF §6). Grid + aisle zones +
// cabinets placed at posX/posY (rotated by orientation, coloured by the active
// lens) + floor objects. Click-to-place/select in edit mode; click-a-cabinet →
// panel in view mode. All colours theme-aware.

function cabinetFill(c: FloorCabinet, lens: FloorLens, mode: "light" | "dark"): string {
  if (lens === "status") return semanticToken(entityStatusIntent(c.status), mode).solid
  const pct = lens === "power" ? c.power.pct : c.space.pct
  return pctColor(pct, mode)
}

const OBJECT_GLYPH: Record<string, string> = { CRAC: "❄", UPS: "⚡", PDU: "▤", COLUMN: "▮", DOOR: "▭" }

export function FloorCanvas({
  plan, lens, mode: editMode, selectedCabinetId, findSpaceMinU, placing,
  onCabinetClick, onObjectClick, onAisleClick, onCellClick,
}: {
  plan: FloorPlan
  lens: FloorLens
  mode: "view" | "edit"
  selectedCabinetId: string | null
  findSpaceMinU: number | null
  placing: boolean // an item is armed for placement — grid cells become click targets
  onCabinetClick: (id: string) => void
  onObjectClick: (id: string) => void
  onAisleClick?: (id: string) => void
  onCellClick: (x: number, y: number) => void
}) {
  const { mode } = useThemeMode()
  const isDark = mode === "dark"
  const cols = plan.room.gridCols ?? 16
  const rows = plan.room.gridRows ?? 12
  const W = cols * CELL
  const H = rows * CELL
  const backgroundUrl = useBackgroundImage(plan.room.id, plan.room.hasBackgroundImage)

  const gridLine = isDark ? "rgba(148,163,184,0.14)" : "rgba(148,163,184,0.25)"
  const shellStroke = isDark ? "#475569" : "#1e293b"
  const shellFill = isDark ? "#0b1220" : "#f8fafc"
  const labelText = isDark ? "#e2e8f0" : "#0f172a"

  function handleGridClick(e: React.MouseEvent<SVGRectElement>) {
    if (!placing) return
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / (rect.width / cols))
    const y = Math.floor((e.clientY - rect.top) / (rect.height / rows))
    onCellClick(Math.max(0, Math.min(cols - 1, x)), Math.max(0, Math.min(rows - 1, y)))
  }

  return (
    <Box sx={{ overflow: "auto", p: 2 }}>
      <svg width={W} height={H} style={{ display: "block", maxWidth: "100%" }} role="img" aria-label={`Floor plan of ${plan.room.name}`}>
        {/* Shell */}
        <rect x={0} y={0} width={W} height={H} fill={shellFill} stroke={shellStroke} strokeWidth={2.5} rx={4} />

        {/* Uploaded plan-image backdrop (dimmed; plot cabinets over it — brief §6) */}
        {backgroundUrl ? (
          <image href={backgroundUrl} x={0} y={0} width={W} height={H}
            preserveAspectRatio="xMidYMid meet" opacity={plan.room.backgroundOpacity ?? 0.4} />
        ) : null}

        {/* Grid */}
        {Array.from({ length: cols - 1 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * CELL} y1={0} x2={(i + 1) * CELL} y2={H} stroke={gridLine} strokeWidth={1} />
        ))}
        {Array.from({ length: rows - 1 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i + 1) * CELL} x2={W} y2={(i + 1) * CELL} stroke={gridLine} strokeWidth={1} />
        ))}

        {/* Aisle zones (behind cabinets; click-to-remove in edit mode) */}
        {plan.aisleZones.map((z) => <AisleRect key={z.id} zone={z} mode={mode} onClick={editMode === "edit" && !placing && onAisleClick ? () => onAisleClick(z.id) : undefined} />)}

        {/* Floor objects */}
        {plan.floorObjects.map((o) => (
          <FloorObjectGlyph key={o.id} obj={o} isDark={isDark} onClick={() => onObjectClick(o.id)} />
        ))}

        {/* Cabinets */}
        {plan.cabinets.map((c) => {
          const cx = c.posX * CELL + CELL / 2
          const cy = c.posY * CELL + CELL / 2
          const s = CELL * 0.84
          const x = c.posX * CELL + (CELL - s) / 2
          const y = c.posY * CELL + (CELL - s) / 2
          const selected = c.id === selectedCabinetId
          const flagged = findSpaceMinU != null && c.space.largestContiguousU >= findSpaceMinU
          const fill = cabinetFill(c, lens, mode)
          return (
            <g key={c.id} transform={`rotate(${c.orientation} ${cx} ${cy})`} onClick={() => onCabinetClick(c.id)} style={{ cursor: "pointer" }}>
              {flagged ? <rect x={x - 3} y={y - 3} width={s + 6} height={s + 6} rx={4} fill="none" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 3" /> : null}
              <rect x={x} y={y} width={s} height={s} rx={3} fill={fill}
                stroke={selected ? "#2563eb" : isDark ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.3)"} strokeWidth={selected ? 2.5 : 1} />
              {/* front-face bar (top edge before rotation) conveys orientation */}
              <rect x={x} y={y} width={s} height={4} rx={2} fill="rgba(15,23,42,0.55)" />
              {c.stranded ? <text x={x + s - 4} y={y + 12} textAnchor="end" fontSize={11} fill="#fff">!</text> : null}
              <text x={cx} y={cy + 3} textAnchor="middle" transform={`rotate(${-c.orientation} ${cx} ${cy})`}
                fontSize={9} fontWeight={700} fill={pickTextOn(fill)}>{shortName(c.name)}</text>
            </g>
          )
        })}

        {/* Click overlay (edit + placing) */}
        {placing ? (
          <rect x={0} y={0} width={W} height={H} fill="rgba(59,130,246,0.04)" onClick={handleGridClick} style={{ cursor: "copy" }} />
        ) : null}
      </svg>
    </Box>
  )
}

function AisleRect({ zone, mode, onClick }: { zone: AisleZoneT; mode: "light" | "dark"; onClick?: () => void }) {
  const g = zone.geometry ?? {}
  if (g.x == null || g.y == null || g.w == null || g.h == null) return null
  const hot = zone.type === "HOT"
  const fill = hot ? (mode === "dark" ? "rgba(239,68,68,0.16)" : "rgba(239,68,68,0.10)") : (mode === "dark" ? "rgba(59,130,246,0.16)" : "rgba(59,130,246,0.10)")
  const stroke = hot ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)"
  return (
    <g onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <rect x={g.x * CELL} y={g.y * CELL} width={g.w * CELL} height={g.h * CELL} fill={fill} stroke={stroke} strokeWidth={1} strokeDasharray="5 3" rx={3} />
      {zone.label ? <text x={g.x * CELL + 5} y={g.y * CELL + 13} fontSize={9} fontWeight={600} fill={stroke}>{zone.label}</text> : null}
    </g>
  )
}

function FloorObjectGlyph({ obj, isDark, onClick }: { obj: FloorObjectT; isDark: boolean; onClick: () => void }) {
  const s = CELL * 0.72
  const x = obj.posX * CELL + (CELL - s) / 2
  const y = obj.posY * CELL + (CELL - s) / 2
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={s} height={s} rx={4} fill={isDark ? "#1e293b" : "#e2e8f0"} stroke={isDark ? "#475569" : "#94a3b8"} strokeWidth={1} />
      <text x={x + s / 2} y={y + s / 2 + 4} textAnchor="middle" fontSize={13} fill={isDark ? "#cbd5e1" : "#475569"}>{OBJECT_GLYPH[obj.objectType] ?? "▢"}</text>
    </g>
  )
}

function shortName(name: string): string {
  return name.length > 7 ? name.slice(0, 6) + "…" : name
}
// Dark fills → white text; light fills → dark text. The lens fills are saturated
// solids/RYG, so a simple luminance split reads well enough.
function pickTextOn(_fill: string): string {
  return "#fff"
}
