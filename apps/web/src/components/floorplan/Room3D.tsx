import React from "react"
import { Box, Typography } from "@mui/material"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { useThemeMode } from "../../lib/theme"
import { pctColor } from "../../lib/capacity"
import { entityStatusIntent, semanticToken } from "../shared/tokens/colors"
import { healthColor } from "../../lib/readings"
import { FloorCabinet, FloorLens, FloorPlan } from "../../lib/floorPlan"
import { buildThermalDataUrl, tempCss } from "./thermal"

// 3D room view (floor plan Phase C). Plain three.js — an orbitable data-centre
// hall: the room floor + true-footprint cabinet volumes at their real height,
// coloured by the active lens, click-through to the cabinet. Kept dependency-
// light (three only, no react-three renderer) to stay clear of the Vite
// dep-optimization traps documented in CLAUDE.md.

const DEFAULT_CELL_MM = 600
const DEFAULT_CAB_W = 600
const DEFAULT_CAB_D = 1070
const U_MM = 44.45

function lensColorCss(c: FloorCabinet, lens: FloorLens, mode: "light" | "dark"): string {
  if (c.status === "PLANNED") return mode === "dark" ? "#33415580" : "#cbd5e1"
  if (lens === "status") return semanticToken(entityStatusIntent(c.status), mode).solid
  if (lens === "health") return healthColor(c.environment?.health ?? "UNKNOWN", mode)
  if (lens === "thermal") return c.environment?.temperatureC != null ? tempCss(c.environment.temperatureC) : "#64748b"
  if (lens === "power" && c.power.measuredPct != null) return pctColor(c.power.measuredPct, mode)
  return pctColor(lens === "power" ? c.power.pct : c.space.pct, mode)
}

export function Room3D({ plan, lens, selectedCabinetId, onCabinetClick }: {
  plan: FloorPlan
  lens: FloorLens
  selectedCabinetId: string | null
  onCabinetClick: (id: string) => void
}) {
  const { mode } = useThemeMode()
  const isDark = mode === "dark"
  const mountRef = React.useRef<HTMLDivElement>(null)
  const [hover, setHover] = React.useState<{ c: FloorCabinet; x: number; y: number } | null>(null)

  // Stable refs into the three scene, shared by the two effects below.
  const three = React.useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera
    controls: OrbitControls; content: THREE.Group | null; meshes: Map<THREE.Object3D, FloorCabinet>
    raf: number
  } | null>(null)
  const cbRef = React.useRef(onCabinetClick); cbRef.current = onCabinetClick

  const cols = plan.room.gridCols ?? 16
  const rows = plan.room.gridRows ?? 12
  const cellM = (plan.room.widthMm && cols ? plan.room.widthMm / cols : DEFAULT_CELL_MM) / 1000
  const roomW = cols * cellM
  const roomD = rows * cellM

  // ── Effect 1: renderer / camera / controls / lights (once) ──────────────
  React.useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = "block"
    renderer.domElement.style.touchAction = "none"

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(isDark ? "#0b1220" : "#eef2f7")

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    const span = Math.max(roomW, roomD)
    camera.position.set(roomW / 2, span * 0.85, roomD * 1.25)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI / 2.05 // don't drop below the floor
    controls.target.set(roomW / 2, 0.4, roomD / 2)
    controls.update()

    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.62 : 0.85))
    const key = new THREE.DirectionalLight(0xffffff, isDark ? 0.75 : 0.9)
    key.position.set(roomW * 0.3, span * 1.2, roomD * 0.15)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.35)
    fill.position.set(roomW, span, roomD)
    scene.add(fill)

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h; camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(mount)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downXY: { x: number; y: number } | null = null

    const toPointer = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const pick = (): THREE.Object3D | null => {
      const t = three.current; if (!t) return null
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects([...t.meshes.keys()], false)
      return hits.length ? hits[0].object : null
    }
    const onMove = (e: PointerEvent) => {
      toPointer(e)
      const obj = pick(); const t = three.current
      if (obj && t) { const c = t.meshes.get(obj)!; setHover({ c, x: e.clientX, y: e.clientY }) }
      else setHover(null)
      renderer.domElement.style.cursor = obj ? "pointer" : "grab"
    }
    const onDown = (e: PointerEvent) => { downXY = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (!downXY) return
      const moved = Math.abs(e.clientX - downXY.x) + Math.abs(e.clientY - downXY.y)
      downXY = null
      if (moved > 5) return // that was an orbit drag, not a click
      toPointer(e); const obj = pick(); const t = three.current
      if (obj && t) cbRef.current(t.meshes.get(obj)!.id)
    }
    renderer.domElement.addEventListener("pointermove", onMove)
    renderer.domElement.addEventListener("pointerdown", onDown)
    renderer.domElement.addEventListener("pointerup", onUp)

    let raf = 0
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)

    three.current = { renderer, scene, camera, controls, content: null, meshes: new Map(), raf }

    return () => {
      cancelAnimationFrame(three.current!.raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointerup", onUp)
      controls.dispose()
      scene.traverse(o => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
      three.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.room.id, isDark])

  // ── Effect 2: (re)build floor + cabinets on data/lens change ─────────────
  React.useEffect(() => {
    const t = three.current
    if (!t) return
    if (t.content) { t.scene.remove(t.content); disposeGroup(t.content) }
    const g = new THREE.Group()
    const meshes = new Map<THREE.Object3D, FloorCabinet>()

    // Floor slab (+ thermal texture in the thermal lens)
    const floorMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x0c1626 : 0xf1f5f9, roughness: 0.95, metalness: 0 })
    if (lens === "thermal") {
      const url = buildThermalDataUrl(plan.cabinets, cols, rows)
      if (url) {
        const tex = new THREE.TextureLoader().load(url)
        tex.colorSpace = THREE.SRGBColorSpace
        floorMat.map = tex; floorMat.color = new THREE.Color(0xffffff); floorMat.needsUpdate = true
      }
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(roomW / 2, 0, roomD / 2)
    g.add(floor)

    // Room grid
    const grid = new THREE.GridHelper(Math.max(roomW, roomD), Math.max(cols, rows), isDark ? 0x334155 : 0xcbd5e1, isDark ? 0x1e293b : 0xe2e8f0)
    ;(grid.material as THREE.Material).opacity = 0.5; (grid.material as THREE.Material).transparent = true
    grid.position.set(roomW / 2, 0.005, roomD / 2)
    g.add(grid)

    // Aisle zones as thin floor tints
    for (const z of plan.aisleZones) {
      const geo = z.geometry ?? {}
      if (geo.x == null || geo.y == null || geo.w == null || geo.h == null) continue
      const hot = z.type === "HOT"
      const a = new THREE.Mesh(
        new THREE.PlaneGeometry(geo.w * cellM, geo.h * cellM),
        new THREE.MeshBasicMaterial({ color: hot ? 0xef4444 : 0x3b82f6, transparent: true, opacity: 0.14 })
      )
      a.rotation.x = -Math.PI / 2
      a.position.set((geo.x + geo.w / 2) * cellM, 0.01, (geo.y + geo.h / 2) * cellM)
      g.add(a)
    }

    // Cabinets — true-footprint volumes
    for (const c of plan.cabinets) {
      const wM = (c.widthMm ?? DEFAULT_CAB_W) / 1000
      const dM = (c.depthMm ?? DEFAULT_CAB_D) / 1000
      const hM = Math.max(1.4, (c.totalU || 42) * U_MM / 1000 + 0.12)
      const selected = c.id === selectedCabinetId
      const col = new THREE.Color(lensColorCss(c, lens, mode))
      const mat = new THREE.MeshStandardMaterial({
        color: col, roughness: 0.62, metalness: 0.15,
        emissive: selected ? new THREE.Color(0x2563eb) : col.clone().multiplyScalar(0.12),
        emissiveIntensity: selected ? 0.6 : 0.35,
        transparent: c.status === "PLANNED", opacity: c.status === "PLANNED" ? 0.45 : 1,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wM, hM, dM), mat)
      const cx = (c.posX + 0.5) * cellM, cz = (c.posY + 0.5) * cellM
      mesh.position.set(cx, hM / 2, cz)
      mesh.rotation.y = THREE.MathUtils.degToRad(-(c.orientation ?? 0))
      // edges for definition
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: selected ? 0x60a5fa : 0x0b1220, transparent: true, opacity: selected ? 0.9 : 0.35 })
      )
      mesh.add(edges)
      // front-face marker strip near the top
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(wM * 0.9, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      )
      marker.position.set(0, hM / 2 - 0.12, dM / 2 + 0.001)
      mesh.add(marker)
      g.add(mesh)
      meshes.set(mesh, c)
    }

    t.scene.add(g)
    t.content = g
    t.meshes = meshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, lens, mode, selectedCabinetId, cols, rows, cellM, roomW, roomD, isDark])

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", bgcolor: isDark ? "#0b1220" : "#eef2f7" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <Box sx={{ position: "absolute", left: 14, bottom: 14, px: "10px", py: "6px", borderRadius: "8px",
        bgcolor: isDark ? "rgba(13,21,38,0.8)" : "rgba(255,255,255,0.9)", border: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 10.5, color: "text.tertiary" }}>Drag to orbit · scroll to zoom · click a cabinet</Typography>
      </Box>
      {hover ? (
        <Box sx={{ position: "absolute", left: Math.min(hover.x - (mountRef.current?.getBoundingClientRect().left ?? 0) + 14, (mountRef.current?.clientWidth ?? 400) - 180),
          top: hover.y - (mountRef.current?.getBoundingClientRect().top ?? 0) + 14, zIndex: 5, pointerEvents: "none", minWidth: 150,
          bgcolor: isDark ? "rgba(6,12,24,0.95)" : "rgba(255,255,255,0.97)", border: "1px solid", borderColor: "divider", borderRadius: "9px", p: "9px 11px", fontSize: 11.5, boxShadow: 3 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: "5px" }}>{hover.c.name}</Typography>
          {hover.c.status === "PLANNED" ? (
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Planned — no equipment</Typography>
          ) : (
            <>
              <Row k="Space" v={`${hover.c.space.pct}% · ${hover.c.space.usedU}U`} />
              <Row k="Power" v={`${hover.c.power.measuredPct ?? hover.c.power.pct}%`} />
              <Row k="Inlet" v={hover.c.environment?.temperatureC != null ? `${hover.c.environment.temperatureC} °C` : "—"} />
            </>
          )}
        </Box>
      ) : null}
    </Box>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "2px 0", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
      <span>{k}</span><b style={{ fontWeight: 600 }}>{v}</b>
    </Box>
  )
}

function disposeGroup(g: THREE.Group) {
  g.traverse(o => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach(x => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose() })
    else if (mat) { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose() }
  })
}

export default Room3D
