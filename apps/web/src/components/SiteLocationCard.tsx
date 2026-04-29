import React from "react"
import { Box, Typography } from "@mui/material"
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined"
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet"
import type { Site } from "../lib/infrastructure"

type Props = { site: Site }

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap()
  React.useEffect(() => {
    map.setView(position, 14, { animate: false })
  }, [map, position[0], position[1]])
  return null
}

export default function SiteLocationCard({ site }: Props) {
  const hasCoords = site.latitude != null && site.longitude != null
  const addressLine = [site.address, site.city, site.postcode].filter(Boolean).join(", ")

  return (
    <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ px: "20px", py: "14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>
          Location
        </Typography>
        {addressLine ? (
          <Typography sx={{ fontSize: 11.5, color: "#64748b", fontWeight: 500, textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {addressLine}
          </Typography>
        ) : null}
      </Box>

      {hasCoords ? (
        <Box sx={{ height: 240, "& .leaflet-container": { height: "100%", width: "100%" } }}>
          <MapContainer
            center={[site.latitude!, site.longitude!]}
            zoom={14}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Recenter position={[site.latitude!, site.longitude!]} />
            <Marker position={[site.latitude!, site.longitude!]} />
          </MapContainer>
        </Box>
      ) : (
        <Box sx={{ py: 5, px: 3, textAlign: "center" }}>
          <PlaceOutlinedIcon sx={{ fontSize: 28, color: "#cbd5e1", mb: "6px" }} />
          <Typography sx={{ fontSize: 12.5, color: "#64748b", fontWeight: 500 }}>
            {addressLine ? "Location not yet mapped" : "No address on file"}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8", mt: "4px" }}>
            {addressLine ? "Geocoding runs automatically when the site is saved." : "Add an address in the site details to place it on the map."}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
