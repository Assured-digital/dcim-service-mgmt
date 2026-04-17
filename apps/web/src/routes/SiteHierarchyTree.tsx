import React from "react"
import { Box, Stack, Typography } from "@mui/material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import MemoryIcon from "@mui/icons-material/Memory"
import StorageIcon from "@mui/icons-material/Storage"
import { Site, Room, Cabinet, assetBg } from "../lib/infrastructure"

export interface SiteHierarchyTreeProps {
  sites: Site[]
  rooms: Room[]
  cabinets: Cabinet[]
  selectedSiteId: string | null
  selectedRoomId: string | "unassigned" | null
  selectedCabinetId: string | null
  selectedAssetId: string | null
  openSiteIds: Set<string>
  openRoomId: string | null
  openCabinetId: string | null
  isLoading: boolean
  onSelectSite: (siteId: string) => void
  onToggleSite: (siteId: string) => void
  onSelectRoom: (roomId: string | "unassigned") => void
  onToggleRoom: (roomId: string) => void
  onSelectCabinet: (cabinetId: string, roomId: string | null) => void
  onToggleCabinet: (cabinetId: string) => void
  onSelectAsset: (assetId: string, cabinetId: string, roomId: string | null) => void
}

const SiteHierarchyTree = React.memo(function SiteHierarchyTree(props: SiteHierarchyTreeProps) {
  const {
    sites, rooms, cabinets, selectedSiteId, selectedRoomId, selectedCabinetId,
    selectedAssetId, openSiteIds, openRoomId, openCabinetId, isLoading,
    onSelectSite, onToggleSite, onSelectRoom, onToggleRoom,
    onSelectCabinet, onToggleCabinet, onSelectAsset,
  } = props

  const unassignedCabinets = React.useMemo(
    () => cabinets.filter(c => !c.roomId),
    [cabinets]
  )

  return (
    <Box sx={{ flex: 1, overflowY: "auto", py: "6px" }}>
      {sites.map(siteItem => {
        const isSiteOpen = openSiteIds.has(siteItem.id)
        const isSiteActive = selectedSiteId === siteItem.id && !selectedRoomId && !selectedCabinetId
        const siteRooms = selectedSiteId === siteItem.id ? rooms : []
        const siteCabinets = selectedSiteId === siteItem.id ? cabinets : []
        return (
          <SiteNode key={siteItem.id}
            site={siteItem} isSiteOpen={isSiteOpen} isSiteActive={isSiteActive}
            rooms={siteRooms} cabinets={siteCabinets}
            unassignedCabinets={selectedSiteId === siteItem.id ? unassignedCabinets : []}
            selectedRoomId={selectedRoomId} selectedCabinetId={selectedCabinetId}
            selectedAssetId={selectedAssetId} openRoomId={openRoomId}
            openCabinetId={openCabinetId} isLoading={isLoading && selectedSiteId === siteItem.id}
            onSelectSite={onSelectSite} onToggleSite={onToggleSite}
            onSelectRoom={onSelectRoom} onToggleRoom={onToggleRoom}
            onSelectCabinet={onSelectCabinet} onToggleCabinet={onToggleCabinet}
            onSelectAsset={onSelectAsset}
          />
        )
      })}
    </Box>
  )
})

// ── Site node ──────────────────────────────────────────────────────────────

interface SiteNodeProps {
  site: Site
  isSiteOpen: boolean
  isSiteActive: boolean
  rooms: Room[]
  cabinets: Cabinet[]
  unassignedCabinets: Cabinet[]
  selectedRoomId: string | "unassigned" | null
  selectedCabinetId: string | null
  selectedAssetId: string | null
  openRoomId: string | null
  openCabinetId: string | null
  isLoading: boolean
  onSelectSite: (id: string) => void
  onToggleSite: (id: string) => void
  onSelectRoom: (id: string | "unassigned") => void
  onToggleRoom: (id: string) => void
  onSelectCabinet: (id: string, roomId: string | null) => void
  onToggleCabinet: (id: string) => void
  onSelectAsset: (assetId: string, cabinetId: string, roomId: string | null) => void
}

const SiteNode = React.memo(function SiteNode(props: SiteNodeProps) {
  const {
    site, isSiteOpen, isSiteActive, rooms, cabinets, unassignedCabinets,
    selectedRoomId, selectedCabinetId, selectedAssetId,
    openRoomId, openCabinetId, isLoading,
    onSelectSite, onToggleSite, onSelectRoom, onToggleRoom,
    onSelectCabinet, onToggleCabinet, onSelectAsset,
  } = props

  return (
    <Box>
      <Stack direction="row" alignItems="center" onClick={() => onSelectSite(site.id)}
        sx={{ px: "8px", py: "8px", cursor: "pointer", bgcolor: isSiteActive ? "rgba(29,78,216,0.08)" : "transparent", borderLeft: isSiteActive ? "2px solid #1d4ed8" : "2px solid transparent", "&:hover": { bgcolor: "rgba(0,0,0,0.03)" } }}>
        <Box onClick={e => { e.stopPropagation(); onToggleSite(site.id) }} sx={{ display: "flex", color: "#94a3b8", mr: "2px" }}>
          {isSiteOpen ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
        </Box>
        <LocationOnIcon sx={{ fontSize: 12.5, color: isSiteActive ? "#1d4ed8" : "#64748b", mr: "7px" }} />
        <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: isSiteActive ? 600 : 500, color: isSiteActive ? "#1d4ed8" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{site.name}</Typography>
      </Stack>

      {isSiteOpen ? (
        <>
          {isLoading ? <Box sx={{ px: 2, py: 1 }}><Typography sx={{ fontSize: 11, color: "#94a3b8" }}>Loading...</Typography></Box> : null}

          {rooms.map(room => {
            const roomCabinets = cabinets.filter(c => c.roomId === room.id)
            const isExpanded = openRoomId === room.id
            const isRoomActive = selectedRoomId === room.id && !selectedCabinetId
            const hasActiveCabinet = roomCabinets.some(c => c.id === selectedCabinetId)
            return (
              <Box key={room.id}>
                <Stack direction="row" alignItems="center" onClick={() => onSelectRoom(room.id)}
                  sx={{ pl: "20px", pr: "8px", py: "7px", cursor: "pointer", bgcolor: isRoomActive ? "rgba(29,78,216,0.07)" : hasActiveCabinet ? "rgba(0,0,0,0.02)" : "transparent", borderLeft: isRoomActive ? "2px solid #1d4ed8" : "2px solid transparent", "&:hover": { bgcolor: isRoomActive ? "rgba(29,78,216,0.07)" : "rgba(0,0,0,0.03)" } }}>
                  <Box onClick={e => { e.stopPropagation(); onToggleRoom(room.id) }} sx={{ display: "flex", alignItems: "center", color: "#94a3b8", mr: "2px", flexShrink: 0 }}>
                    {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
                  </Box>
                  <MemoryIcon sx={{ fontSize: 12, color: isRoomActive ? "#1d4ed8" : "#94a3b8", mr: "7px", flexShrink: 0 }} />
                  <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: isRoomActive || hasActiveCabinet ? 600 : 400, color: isRoomActive ? "#1d4ed8" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.name}</Typography>
                  <Typography sx={{ fontSize: 10, color: "#94a3b8", ml: "4px" }}>{roomCabinets.length}</Typography>
                </Stack>

                {isExpanded ? roomCabinets.map(cab => (
                  <CabinetNode key={cab.id}
                    cabinet={cab} roomId={room.id}
                    isActive={selectedCabinetId === cab.id}
                    isExpanded={openCabinetId === cab.id}
                    selectedAssetId={selectedAssetId}
                    onSelectCabinet={onSelectCabinet}
                    onToggleCabinet={onToggleCabinet}
                    onSelectAsset={onSelectAsset}
                  />
                )) : null}
              </Box>
            )
          })}

          {unassignedCabinets.length > 0 ? (
            <Stack direction="row" alignItems="center" onClick={() => onSelectRoom("unassigned")}
              sx={{ pl: "20px", pr: "8px", py: "7px", cursor: "pointer", bgcolor: selectedRoomId === "unassigned" && !selectedCabinetId ? "rgba(29,78,216,0.07)" : "transparent", borderLeft: selectedRoomId === "unassigned" && !selectedCabinetId ? "2px solid #1d4ed8" : "2px solid transparent", "&:hover": { bgcolor: "rgba(0,0,0,0.03)" } }}>
              <ChevronRightIcon sx={{ fontSize: 14, color: "#94a3b8", mr: "2px" }} />
              <StorageIcon sx={{ fontSize: 12, color: "#94a3b8", mr: "7px" }} />
              <Typography sx={{ flex: 1, fontSize: 12.5, color: "#475569" }}>Unassigned</Typography>
              <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{unassignedCabinets.length}</Typography>
            </Stack>
          ) : null}
        </>
      ) : null}
    </Box>
  )
})

// ── Cabinet node ───────────────────────────────────────────────────────────

interface CabinetNodeProps {
  cabinet: Cabinet
  roomId: string | null
  isActive: boolean
  isExpanded: boolean
  selectedAssetId: string | null
  onSelectCabinet: (id: string, roomId: string | null) => void
  onToggleCabinet: (id: string) => void
  onSelectAsset: (assetId: string, cabinetId: string, roomId: string | null) => void
}

const CabinetNode = React.memo(function CabinetNode({
  cabinet: cab, roomId, isActive, isExpanded, selectedAssetId,
  onSelectCabinet, onToggleCabinet, onSelectAsset
}: CabinetNodeProps) {

  const sortedAssets = React.useMemo(
    () => cab.assets.slice().sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0)),
    [cab.assets]
  )

  return (
    <Box>
      <Stack direction="row" alignItems="center"
        onClick={e => { e.stopPropagation(); onSelectCabinet(cab.id, roomId) }}
        sx={{ pl: "34px", pr: "8px", py: "6px", cursor: "pointer", bgcolor: isActive ? "rgba(29,78,216,0.1)" : "transparent", borderLeft: isActive ? "2px solid #1d4ed8" : "2px solid transparent", "&:hover": { bgcolor: isActive ? "rgba(29,78,216,0.1)" : "rgba(0,0,0,0.03)" } }}>
        {cab._count.assets > 0 ? (
          <Box onClick={e => { e.stopPropagation(); onToggleCabinet(cab.id) }} sx={{ display: "flex", color: "#94a3b8", mr: "2px" }}>
            {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 13 }} /> : <ChevronRightIcon sx={{ fontSize: 13 }} />}
          </Box>
        ) : <Box sx={{ width: 14 }} />}
        <StorageIcon sx={{ fontSize: 11, color: isActive ? "#1d4ed8" : "#64748b", mr: "7px" }} />
        <Typography sx={{ flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? "#1d4ed8" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cab.name}</Typography>
        <Typography sx={{ fontSize: 10, color: "#94a3b8", ml: "4px" }}>{cab._count.assets}</Typography>
      </Stack>

      {isExpanded ? sortedAssets.map(asset => {
        const isAssetActive = selectedAssetId === asset.id
        return (
          <Stack key={asset.id} direction="row" alignItems="center"
            onClick={e => { e.stopPropagation(); onSelectAsset(asset.id, cab.id, roomId) }}
            sx={{ pl: "58px", pr: "8px", py: "5px", cursor: "pointer", bgcolor: isAssetActive ? "rgba(29,78,216,0.07)" : "transparent", borderLeft: isAssetActive ? "2px solid #1d4ed8" : "2px solid transparent", "&:hover": { bgcolor: isAssetActive ? "rgba(29,78,216,0.07)" : "rgba(0,0,0,0.03)" } }}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", mr: "7px", bgcolor: isAssetActive ? "#1d4ed8" : assetBg(asset.assetType) === "#dbeafe" ? "#93c5fd" : "#cbd5e1" }} />
            <Typography sx={{ fontSize: 11, color: isAssetActive ? "#1d4ed8" : "#64748b", fontWeight: isAssetActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {asset.uPosition != null ? `U${asset.uPosition} ` : ""}{asset.name}
            </Typography>
          </Stack>
        )
      }) : null}
    </Box>
  )
})

export default SiteHierarchyTree