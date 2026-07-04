import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography,
} from "@mui/material"
import { useThemeMode } from "../lib/theme"
import { statusColors } from "../components/shared/tokens/colors"
import { PORT_TYPE_LABELS, PortType, TraceNode, TraceSegment, traceCable } from "../lib/ports"

// End-to-end cable trace (DCIM_DESIGN_SPEC §6.1, Horizon 2). NetBox-style vertical
// path: each asset/port is a node card; between nodes a connector shows the segment
// — a CABLE (media type · length · colour · status tint) or a PASS-THROUGH (the
// internal front↔rear link inside a patch panel). Asset cards link to their detail.
export default function CableTraceDialog({ startPortId, onClose }: { startPortId: string; onClose: () => void }) {
  const { mode } = useThemeMode()
  const nav = useNavigate()
  const { data, isLoading, isError } = useQuery({ queryKey: ["cable-trace", startPortId], queryFn: () => traceCable(startPortId) })

  const goto = (assetId: string) => { nav(`/asset-register/assets/${assetId}`); onClose() }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Cable trace</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}><CircularProgress size={22} /></Box>
        ) : isError ? (
          <Typography sx={{ fontSize: 12.5, color: "error.main", py: 2 }}>Could not load the trace.</Typography>
        ) : !data || data.nodes.length <= 1 ? (
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", py: 2 }}>
            No further path — this port terminates here.
          </Typography>
        ) : (
          <Box sx={{ py: 1 }}>
            {data.nodes.map((node, i) => (
              <React.Fragment key={`${node.portId ?? node.assetId}-${i}`}>
                <NodeCard node={node} mode={mode} onOpen={() => goto(node.assetId)} />
                {i < data.segments.length ? <SegmentConnector seg={data.segments[i]} mode={mode} /> : null}
              </React.Fragment>
            ))}
            {data.truncated ? (
              <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 1, textAlign: "center" }}>
                Path truncated at 32 hops.
              </Typography>
            ) : null}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} sx={{ textTransform: "none" }}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

function NodeCard({ node, mode, onOpen }: { node: TraceNode; mode: "light" | "dark"; onOpen: () => void }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", px: "12px", py: "8px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Typography onClick={onOpen}
          sx={{ fontSize: 12.5, fontWeight: 600, color: "primary.main", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", "&:hover": { textDecoration: "underline" } }}>
          {node.assetName}
        </Typography>
        {node.assetTag ? <Typography sx={{ fontSize: 10.5, color: "text.secondary", flexShrink: 0 }}>{node.assetTag}</Typography> : null}
      </Box>
      {node.portName ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
          <Typography sx={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{node.portName}</Typography>
          {node.portType ? (
            <Chip size="small" label={PORT_TYPE_LABELS[node.portType as PortType] ?? node.portType}
              sx={{ height: 16, fontSize: 9, fontWeight: 600, bgcolor: mode === "dark" ? "#1e293b" : "#f1f5f9", color: "text.secondary" }} />
          ) : null}
        </Box>
      ) : (
        <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5, fontStyle: "italic" }}>asset-level (no port)</Typography>
      )}
    </Box>
  )
}

// The connector drawn between two node cards. A cable carries media/length/colour +
// a status tint; a pass-through is the subtle dashed internal link inside a panel.
function SegmentConnector({ seg, mode }: { seg: TraceSegment; mode: "light" | "dark" }) {
  const isCable = seg.type === "cable"
  const tint = isCable && seg.status ? statusColors(seg.status, mode) : null
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, pl: "18px", py: "5px" }}>
      <Box sx={{ width: 0, borderLeft: isCable ? "2px solid" : "2px dashed", borderColor: isCable ? "divider" : "text.disabled", alignSelf: "stretch", minHeight: 18 }} />
      {isCable ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600 }}>{seg.connectionType || "cable"}</Typography>
          {seg.cableLength != null ? <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{seg.cableLength} m</Typography> : null}
          {seg.cableColour ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: cssColour(seg.cableColour), border: "1px solid", borderColor: "divider" }} />
              <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{seg.cableColour}</Typography>
            </Box>
          ) : null}
          {tint ? <Chip size="small" label={seg.status} sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: tint.bg, color: tint.text }} /> : null}
        </Box>
      ) : (
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontStyle: "italic" }}>pass-through</Typography>
      )}
    </Box>
  )
}

// Map a free-text colour to a CSS value for the swatch; unknown names fall back to
// a neutral grey rather than rendering an invalid colour.
function cssColour(name: string): string {
  const key = name.trim().toLowerCase().replace(/[^a-z]/g, "")
  const known: Record<string, string> = {
    blue: "#2563eb", red: "#dc2626", green: "#16a34a", yellow: "#eab308", orange: "#ea580c",
    grey: "#6b7280", gray: "#6b7280", black: "#111827", white: "#e5e7eb", purple: "#9333ea",
    pink: "#ec4899", brown: "#92400e", aqua: "#06b6d4", cyan: "#06b6d4",
  }
  return known[key] ?? "#94a3b8"
}
