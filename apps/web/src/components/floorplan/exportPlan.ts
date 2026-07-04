// Floor-plan export (Phase D). No external deps — rasterise the live SVG / WebGL
// canvas to a PNG and trigger a download. Overlays (legend/minimap) are chrome,
// not part of the exported plan; the export captures the plan surface itself.

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
}

export function safeName(parts: (string | null | undefined)[], ext: string): string {
  const base = parts.filter(Boolean).join("-").replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").toLowerCase()
  return `${base || "floor-plan"}.${ext}`
}

// Serialise an <svg> to a 2× PNG on a solid background. Inline data-URI images
// (the thermal heatmap) rasterise; external refs (a blob background) are skipped
// by the browser's img-loaded-SVG sandbox — acceptable for an export.
export async function exportSvgPng(svg: SVGSVGElement, filename: string, background: string): Promise<void> {
  const w = svg.clientWidth || Number(svg.getAttribute("width")) || 1200
  const h = svg.clientHeight || Number(svg.getAttribute("height")) || 800
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h))
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  const xml = new XMLSerializer().serializeToString(clone)
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml)

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("no 2d context")); return }
      ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      try { triggerDownload(canvas.toDataURL("image/png"), filename); resolve() }
      catch (e) { reject(e as Error) }
    }
    img.onerror = () => reject(new Error("svg render failed"))
    img.src = svgUrl
  })
}

// A WebGL canvas needs preserveDrawingBuffer to survive toDataURL.
export function exportCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  triggerDownload(canvas.toDataURL("image/png"), filename)
}
