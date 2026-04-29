import React from "react"
import { useNavigate } from "react-router-dom"
import { Box, Button, Stack, Typography } from "@mui/material"
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined"
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import type { Site } from "../lib/infrastructure"

export type SiteAssetCounts = Record<string, { cabinets: number; assets: number }>

type Props = {
  sites: Site[]
  siteAssetCounts: SiteAssetCounts
}

type MappedSite = Site & { latitude: number; longitude: number }

function hasCoords(site: Site): site is MappedSite {
  return site.latitude != null && site.longitude != null
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  React.useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 12, { animate: false })
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 14, animate: false })
  }, [map, points])
  return null
}

export default function SitesMapCard({ sites, siteAssetCounts }: Props) {
  const navigate = useNavigate()
  const mappedSites = React.useMemo(() => sites.filter(hasCoords), [sites])
  const points = React.useMemo<[number, number][]>(
    () => mappedSites.map(s => [s.latitude, s.longitude]),
    [mappedSites]
  )

  const totalSites = sites.length
  const withoutCoords = totalSites - mappedSites.length

  return (
    <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ px: "20px", py: "14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>
          Site Map
        </Typography>
        {withoutCoords > 0 && mappedSites.length > 0 ? (
          <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>
            {withoutCoords} site{withoutCoords === 1 ? "" : "s"} without a mapped location
          </Typography>
        ) : null}
      </Box>

      {mappedSites.length === 0 ? (
        <Box sx={{ py: 6, px: 4, textAlign: "center" }}>
          <PlaceOutlinedIcon sx={{ fontSize: 32, color: "#cbd5e1", mb: 1 }} />
          <Typography sx={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
            No sites with mapped locations yet
          </Typography>
          <Typography sx={{ fontSize: 12, color: "#94a3b8", mt: "4px" }}>
            Add an address to a site and it'll appear here automatically.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ height: 360, "& .leaflet-container": { height: "100%", width: "100%" } }}>
          <MapContainer
            center={points[0]}
            zoom={10}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {mappedSites.map(site => {
              const counts = siteAssetCounts[site.id] ?? { cabinets: 0, assets: 0 }
              const addressLine = [site.address, site.city, site.postcode].filter(Boolean).join(", ")
              return (
                <Marker key={site.id} position={[site.latitude, site.longitude]}>
                  <Popup>
                    <Box sx={{ minWidth: 200 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                        {site.name}
                      </Typography>
                      {addressLine ? (
                        <Typography sx={{ fontSize: 11.5, color: "#64748b", mt: "2px" }}>
                          {addressLine}
                        </Typography>
                      ) : null}
                      <Stack direction="row" spacing={0.75} sx={{ mt: "8px", mb: "10px" }}>
                        <Chip label={`${counts.cabinets} cabinet${counts.cabinets === 1 ? "" : "s"}`} />
                        <Chip label={`${counts.assets} asset${counts.assets === 1 ? "" : "s"}`} />
                      </Stack>
                      <Button
                        size="small"
                        variant="contained"
                        fullWidth
                        onClick={() => navigate(`/asset-hierarchy/${site.id}`)}
                      >
                        Open
                      </Button>
                    </Box>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </Box>
      )}
    </Box>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <Box sx={{ px: "8px", py: "2px", bgcolor: "#f1f5f9", borderRadius: "6px" }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: "#475569", letterSpacing: "0.02em" }}>
        {label}
      </Typography>
    </Box>
  )
}
