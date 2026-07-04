import React from "react"
import { Box, Typography } from "@mui/material"
import { api } from "../../lib/api"
import { useThemeMode } from "../../lib/theme"
import { pctColor } from "../../lib/capacity"
import { entityStatusIntent, semanticToken } from "../shared/tokens/colors"
import { FloorCabinet, FloorLens, FloorObjectT, AisleZoneT, FloorPlan } from "../../lib/floorPlan"
import { healthColor, HEALTH_LABEL } from "../../lib/readings"

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

// The architectural room canvas (DCIM_DESIGN_BRIEF §6, Phase A). A TRUE-SCALE
// metric plan: the room is drawn from its mm dimensions, cabinets at their real
// footprint (widthMm × depthMm, default 600 × 1070) placed on the grid, coloured
// by the active lens. Zoom / pan / fit, name labels, a per-lens legend, a metric
// scale bar, a minimap and hover stats. Interactions (place / select / floor
// objects / aisles) are preserved from the grid version.

const BASE = 44          // px per grid cell at scale 1 (internal coordinate unit)
const DEFAULT_CELL_MM = 600
const DEFAULT_CAB_W = 600
const DEFAULT_CAB_D = 1070

function cabinetFill(c: FloorCabinet, lens: FloorLens, mode: "light" | "dark"): string {
  if (c.status === "PLANNED") return mode === "dark" ? "#243247" : "#cbd5e1"
  if (lens === "status") return semanticToken(entityStatusIntent(c.status), mode).solid
  if (lens === "health") return healthColor(c.environment?.health ?? "UNKNOWN", mode)
  if (lens === "power" && c.power.measuredPct != null) return pctColor(c.power.measuredPct, mode)
  const pct = lens === "power" ? c.power.pct : c.space.pct
  return pctColor(pct, mode)
}

const OBJECT_GLYPH: Record<string, string> = { CRAC: "❄", UPS: "⚡", PDU: "▤", COLUMN: "▮", DOOR: "▭" }
const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ")

type Viewport = { scale: number; tx: number; ty: number }

export function FloorCanvas({
  plan, lens, mode: editMode, selectedCabinetId, findSpaceMinU, placing,
  onCabinetClick, onObjectClick, onAisleClick, onCellClick,
}: {
  plan: FloorPlan
  lens: FloorLens
  mode: "view" | "edit"
  selectedCabinetId: string | null
  findSpaceMinU: number | null
  placing: boolean
  onCabinetClick: (id: string) => void
  onObjectClick: (id: string) => void
  onAisleClick?: (id: string) => void
  onCellClick: (x: number, y: number) => void
}) {
  const { mode } = useThemeMode()
  const isDark = mode === "dark"
  const cols = plan.room.gridCols ?? 16
  const rows = plan.room.gridRows ?? 12
  const W = cols * BASE
  const H = rows * BASE
  const cellMm = plan.room.widthMm && cols ? plan.room.widthMm / cols : DEFAULT_CELL_MM
  const pxPerMm = BASE / cellMm
  const backgroundUrl = useBackgroundImage(plan.room.id, plan.room.hasBackgroundImage)

  const gridLine = isDark ? "rgba(148,163,184,0.10)" : "rgba(148,163,184,0.22)"
  const shellStroke = isDark ? "#334155" : "#cbd5e1"
  const shellFill = isDark ? "#0c1626" : "#f8fafc"

  const wrapRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [size, setSize] = React.useState({ w: 800, h: 600 })
  const [vp, setVp] = React.useState<Viewport>({ scale: 1, tx: 0, ty: 0 })
  const [hover, setHover] = React.useState<{ c: FloorCabinet; x: number; y: number } | null>(null)
  const fittedRef = React.useRef<string | null>(null)

  // Fit the room into the current viewport (0.9 padding).
  const fit = React.useCallback((w: number, h: number) => {
    const s = Math.min(w / W, h / H) * 0.9
    setVp({ scale: s, tx: (w - W * s) / 2, ty: (h - H * s) / 2 })
  }, [W, H])

  // Measure + fit on mount, room change, and resize (only auto-fit until the
  // user has interacted with THIS room).
  React.useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
      if (fittedRef.current !== plan.room.id) { fit(r.width, r.height); fittedRef.current = plan.room.id }
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [plan.room.id, fit])

  // Zoom toward a point (container-relative px).
  const zoomAt = React.useCallback((cx: number, cy: number, factor: number) => {
    setVp(v => {
      const min = Math.min(size.w / W, size.h / H) * 0.55
      const ns = Math.max(min, Math.min(min * 14, v.scale * factor))
      return { scale: ns, tx: cx - (cx - v.tx) * (ns / v.scale), ty: cy - (cy - v.ty) * (ns / v.scale) }
    })
  }, [size, W, H])

  // Non-passive wheel zoom (React onWheel is passive → can't preventDefault).
  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12)
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [zoomAt])

  // Drag-to-pan on the background (not on cabinets/objects). Track movement so a
  // click that placed/selected isn't swallowed as a pan.
  const drag = React.useRef<{ on: boolean; x: number; y: number; moved: number }>({ on: false, x: 0, y: 0, moved: 0 })
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).closest("[data-hit]")) return
    drag.current = { on: true, x: e.clientX, y: e.clientY, moved: 0 }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.on) return
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
    drag.current.x = e.clientX; drag.current.y = e.clientY; drag.current.moved += Math.abs(dx) + Math.abs(dy)
    setVp(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
  }
  function onPointerUp(e: React.PointerEvent) {
    const wasDrag = drag.current.moved > 4
    drag.current.on = false
    // Placing: a background click (not a pan) drops at the grid cell under it.
    if (placing && !wasDrag) {
      const r = svgRef.current!.getBoundingClientRect()
      const gx = Math.floor(((e.clientX - r.left) - vp.tx) / (BASE * vp.scale))
      const gy = Math.floor(((e.clientY - r.top) - vp.ty) / (BASE * vp.scale))
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) onCellClick(gx, gy)
    }
  }

  const showLabels = BASE * vp.scale > 17

  return (
    <Box ref={wrapRef} sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden",
      bgcolor: isDark ? "#0b1220" : "#eef2f7" }}>
      <svg ref={svgRef} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}
        role="img" aria-label={`Floor plan of ${plan.room.name}`}
        style={{ display: "block", cursor: drag.current.on ? "grabbing" : placing ? "copy" : "grab", touchAction: "none" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <g transform={`translate(${vp.tx} ${vp.ty}) scale(${vp.scale})`}>
          {/* Shell */}
          <rect x={0} y={0} width={W} height={H} fill={shellFill} stroke={shellStroke} strokeWidth={3} rx={10} />
          {backgroundUrl ? (
            <image href={backgroundUrl} x={0} y={0} width={W} height={H}
              preserveAspectRatio="xMidYMid meet" opacity={plan.room.backgroundOpacity ?? 0.4} />
          ) : null}
          {/* Metre grid */}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line key={`v${i}`} x1={(i + 1) * BASE} y1={0} x2={(i + 1) * BASE} y2={H} stroke={gridLine} strokeWidth={1} />
          ))}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={(i + 1) * BASE} x2={W} y2={(i + 1) * BASE} stroke={gridLine} strokeWidth={1} />
          ))}

          {/* Aisle zones */}
          {plan.aisleZones.map((z) => (
            <AisleRect key={z.id} zone={z} mode={mode}
              onClick={editMode === "edit" && !placing && onAisleClick ? () => onAisleClick(z.id) : undefined} />
          ))}

          {/* Floor objects */}
          {plan.floorObjects.map((o) => (
            <FloorObjectGlyph key={o.id} obj={o} isDark={isDark} onClick={() => onObjectClick(o.id)} />
          ))}

          {/* Cabinets — true-scale footprints */}
          {plan.cabinets.map((c) => {
            const cx = (c.posX + 0.5) * BASE
            const cy = (c.posY + 0.5) * BASE
            const wPx = Math.max(14, ((c.widthMm ?? DEFAULT_CAB_W) / cellMm) * BASE)
            const dPx = Math.max(14, ((c.depthMm ?? DEFAULT_CAB_D) / cellMm) * BASE)
            const x = cx - wPx / 2, y = cy - dPx / 2
            const selected = c.id === selectedCabinetId
            const flagged = findSpaceMinU != null && c.space.largestContiguousU >= findSpaceMinU
            const fill = cabinetFill(c, lens, mode)
            return (
              <g key={c.id} data-hit transform={`rotate(${c.orientation} ${cx} ${cy})`}
                onClick={() => onCabinetClick(c.id)} style={{ cursor: "pointer" }}
                onMouseEnter={(e) => setHover({ c, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover(h => (h && h.c.id === c.id ? { c, x: e.clientX, y: e.clientY } : h))}
                onMouseLeave={() => setHover(null)}>
                {flagged ? <rect x={x - 4} y={y - 4} width={wPx + 8} height={dPx + 8} rx={5} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeDasharray="5 4" /> : null}
                <rect x={x} y={y} width={wPx} height={dPx} rx={4} fill={fill}
                  stroke={selected ? "#3b82f6" : "rgba(3,8,18,0.5)"} strokeWidth={selected ? 4 : 1.5} />
                {/* front-face bar (top edge before rotation) conveys orientation */}
                <rect x={x + 2} y={y + 2} width={wPx - 4} height={5} rx={2} fill="rgba(3,8,18,0.42)" />
                {c.stranded ? <text x={x + wPx - 5} y={y + 15} textAnchor="end" fontSize={12} fill="#fff">!</text> : null}
                {showLabels ? (
                  <text x={cx} y={cy + 4} textAnchor="middle" transform={`rotate(${-c.orientation} ${cx} ${cy})`}
                    fontSize={13} fontWeight={700} fill="#fff" paintOrder="stroke" stroke="rgba(2,6,16,0.4)" strokeWidth={0.8}>
                    {c.name}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <Box sx={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column",
        bgcolor: isDark ? "rgba(13,21,38,0.86)" : "rgba(255,255,255,0.92)", border: "1px solid", borderColor: "divider",
        borderRadius: "9px", overflow: "hidden", backdropFilter: "blur(6px)" }}>
        {[["+", () => zoomAt(size.w / 2, size.h / 2, 1.25)], ["Fit", () => fit(size.w, size.h)], ["−", () => zoomAt(size.w / 2, size.h / 2, 1 / 1.25)]].map(([lbl, fn], i) => (
          <Box key={i} component="button" onClick={fn as () => void}
            sx={{ appearance: "none", border: 0, borderTop: i ? "1px solid" : 0, borderColor: "divider",
              bgcolor: "transparent", color: "text.secondary", cursor: "pointer", width: 34, height: 30,
              fontSize: lbl === "Fit" ? 10.5 : 16, fontWeight: 600, "&:hover": { color: "text.primary" } }}>
            {lbl as string}
          </Box>
        ))}
      </Box>

      {/* Scale bar */}
      <ScaleBar pxPerMm={pxPerMm} scale={vp.scale} isDark={isDark} />

      {/* Legend */}
      <FloorLegend lens={lens} cabinets={plan.cabinets} mode={mode} isDark={isDark} />

      {/* Minimap */}
      <Minimap plan={plan} W={W} H={H} vp={vp} size={size} isDark={isDark}
        onRecenter={(mx, my) => setVp(v => ({ ...v, tx: size.w / 2 - mx * v.scale, ty: size.h / 2 - my * v.scale }))} />

      {/* Hover tooltip */}
      {hover ? <HoverTip hover={hover} wrapRef={wrapRef} lens={lens} isDark={isDark} /> : null}
    </Box>
  )
}

// ── Scale bar: a ~90px rule labelled with the metric distance it spans ────────
function ScaleBar({ pxPerMm, scale, isDark }: { pxPerMm: number; scale: number; isDark: boolean }) {
  const pxPerM = pxPerMm * 1000 * scale
  const targetM = 90 / pxPerM
  const nice = targetM >= 5 ? Math.round(targetM) : targetM >= 2 ? Math.round(targetM * 2) / 2 : targetM >= 1 ? 1 : 0.5
  const w = nice * pxPerM
  return (
    <Box sx={{ position: "absolute", left: 14, bottom: 148, display: "flex", alignItems: "center", gap: "8px",
      fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: isDark ? "#9fb0c8" : "#475569" }}>
      <Box sx={{ width: `${w}px`, height: 8, borderLeft: "2px solid", borderRight: "2px solid", borderBottom: "2px solid", borderColor: "currentColor" }} />
      <span>{nice >= 1 ? `${nice} m` : `${nice * 100} cm`}</span>
    </Box>
  )
}

// ── Legend: gradient for space/power, swatches for status/health ──────────────
function FloorLegend({ lens, cabinets, mode, isDark }: { lens: FloorLens; cabinets: FloorCabinet[]; mode: "light" | "dark"; isDark: boolean }) {
  const card = { position: "absolute", left: 14, bottom: 14, minWidth: 176, p: "11px 13px",
    bgcolor: isDark ? "rgba(13,21,38,0.86)" : "rgba(255,255,255,0.94)", border: "1px solid", borderColor: "divider",
    borderRadius: "11px", backdropFilter: "blur(6px)" } as const
  const h4 = { fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "text.tertiary", mb: 1 } as const

  if (lens === "space" || lens === "power") {
    return (
      <Box sx={card}>
        <Typography sx={h4}>{lens === "space" ? "U utilisation" : "Load vs feed"}</Typography>
        <Box sx={{ height: 9, borderRadius: "5px", mb: "6px", background: "linear-gradient(90deg,#22c55e,#22c55e 55%,#f59e0b 74%,#ef4444)" }} />
        <Box sx={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 10, color: "text.secondary" }}>
          <span>0%</span><span>65</span><span>85</span><span>100%</span>
        </Box>
      </Box>
    )
  }
  const swatches: [string, string][] = lens === "health"
    ? (["OK", "WARNING", "CRITICAL", "UNKNOWN"] as const).map(k => [HEALTH_LABEL[k], healthColor(k, mode)])
    : Array.from(new Set(cabinets.map(c => c.status))).sort()
        .map(s => [humanize(s), s === "PLANNED" ? (isDark ? "#243247" : "#cbd5e1") : semanticToken(entityStatusIntent(s), mode).solid])
  return (
    <Box sx={card}>
      <Typography sx={h4}>{lens === "health" ? "Environmental health" : "Operational status"}</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "7px" }}>
        {swatches.map(([label, color]) => (
          <Box key={label} sx={{ display: "flex", alignItems: "center", gap: "9px", fontSize: 12, color: "text.secondary" }}>
            <Box sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: color, flexShrink: 0 }} />{label}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ── Minimap ───────────────────────────────────────────────────────────────
function Minimap({ plan, W, H, vp, size, isDark, onRecenter }: {
  plan: FloorPlan; W: number; H: number; vp: Viewport; size: { w: number; h: number }; isDark: boolean
  onRecenter: (mx: number, my: number) => void
}) {
  const MW = 176, MH = 118, pad = 8
  const s = Math.min((MW - pad * 2) / W, (MH - pad * 2) / H)
  const ox = (MW - W * s) / 2, oy = (MH - H * s) / 2
  const vx = -vp.tx / vp.scale, vy = -vp.ty / vp.scale
  const vw = size.w / vp.scale, vh = size.h / vp.scale
  return (
    <Box onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onRecenter((e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s)
      }}
      sx={{ position: "absolute", right: 12, bottom: 12, width: MW, height: MH, cursor: "pointer",
        bgcolor: isDark ? "rgba(13,21,38,0.86)" : "rgba(255,255,255,0.94)", border: "1px solid", borderColor: "divider",
        borderRadius: "10px", backdropFilter: "blur(6px)" }}>
      <svg width={MW} height={MH} style={{ display: "block" }}>
        <rect x={ox} y={oy} width={W * s} height={H * s} rx={2} fill={isDark ? "#0c1626" : "#e2e8f0"} stroke={isDark ? "#243247" : "#cbd5e1"} />
        {plan.cabinets.map(c => (
          <rect key={c.id} x={ox + c.posX * BASE * s} y={oy + c.posY * BASE * s} width={Math.max(1.2, BASE * s * 0.8)} height={Math.max(1.2, BASE * s * 0.8)} rx={0.6} fill={isDark ? "#3b556f" : "#94a3b8"} />
        ))}
        <rect x={ox + vx * s} y={oy + vy * s} width={Math.max(4, vw * s)} height={Math.max(4, vh * s)} rx={2} fill="rgba(96,165,250,0.16)" stroke="#60a5fa" strokeWidth={1.2} />
      </svg>
    </Box>
  )
}

// ── Hover tooltip ─────────────────────────────────────────────────────────
function HoverTip({ hover, wrapRef, lens, isDark }: {
  hover: { c: FloorCabinet; x: number; y: number }; wrapRef: React.RefObject<HTMLDivElement>; lens: FloorLens; isDark: boolean
}) {
  const c = hover.c
  const r = wrapRef.current?.getBoundingClientRect()
  let left = (hover.x - (r?.left ?? 0)) + 14, top = (hover.y - (r?.top ?? 0)) + 14
  if (r && left + 180 > r.width) left -= 194
  if (r && top + 130 > r.height) top -= 140
  const h = c.environment?.health ?? "UNKNOWN"
  const line = (k: string, v: string) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "2px 0", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
      <span>{k}</span><b style={{ color: isDark ? "#e6edf7" : "#0f172a", fontWeight: 600 }}>{v}</b>
    </Box>
  )
  const planned = c.status === "PLANNED"
  return (
    <Box sx={{ position: "absolute", left, top, zIndex: 9, pointerEvents: "none", minWidth: 158,
      bgcolor: isDark ? "rgba(6,12,24,0.95)" : "rgba(255,255,255,0.97)", border: "1px solid", borderColor: "divider",
      borderRadius: "9px", p: "9px 11px", fontSize: 11.5, boxShadow: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "7px", fontSize: 12.5, fontWeight: 600, mb: "6px" }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: healthColor(h, isDark ? "dark" : "light") }} />
        {c.name}
      </Box>
      {line("Space", planned ? "—" : `${c.space.pct}% · ${c.space.usedU}U`)}
      {line("Power", planned ? "—" : `${c.power.measuredPct ?? c.power.pct}%`)}
      {line("Inlet", c.environment?.temperatureC != null ? `${c.environment.temperatureC} °C` : "—")}
      {line("Status", humanize(c.status))}
    </Box>
  )
}

function AisleRect({ zone, mode, onClick }: { zone: AisleZoneT; mode: "light" | "dark"; onClick?: () => void }) {
  const g = zone.geometry ?? {}
  if (g.x == null || g.y == null || g.w == null || g.h == null) return null
  const hot = zone.type === "HOT"
  const fill = hot ? (mode === "dark" ? "rgba(239,90,80,0.14)" : "rgba(239,68,68,0.10)") : (mode === "dark" ? "rgba(56,120,230,0.14)" : "rgba(59,130,246,0.10)")
  const stroke = hot ? "rgba(240,120,110,0.5)" : "rgba(96,150,240,0.5)"
  return (
    <g data-hit={onClick ? "" : undefined} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <rect x={g.x * BASE} y={g.y * BASE} width={g.w * BASE} height={g.h * BASE} fill={fill} stroke={stroke} strokeWidth={1.5} strokeDasharray="7 5" rx={4} />
      {zone.label ? <text x={g.x * BASE + 6} y={g.y * BASE + 15} fontSize={10} fontWeight={700} letterSpacing="0.1em" fill={stroke}>{zone.label}</text> : null}
    </g>
  )
}

function FloorObjectGlyph({ obj, isDark, onClick }: { obj: FloorObjectT; isDark: boolean; onClick: () => void }) {
  const s = BASE * 0.72
  const x = obj.posX * BASE + (BASE - s) / 2
  const y = obj.posY * BASE + (BASE - s) / 2
  return (
    <g data-hit onClick={onClick} style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={s} height={s} rx={4} fill={isDark ? "#1e293b" : "#e2e8f0"} stroke={isDark ? "#475569" : "#94a3b8"} strokeWidth={1} />
      <text x={x + s / 2} y={y + s / 2 + 4} textAnchor="middle" fontSize={14} fill={isDark ? "#cbd5e1" : "#475569"}>{OBJECT_GLYPH[obj.objectType] ?? "▢"}</text>
    </g>
  )
}
