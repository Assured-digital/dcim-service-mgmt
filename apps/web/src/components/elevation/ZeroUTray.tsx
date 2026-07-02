import React from "react"
import { Box, Stack, Typography } from "@mui/material"
import { useThemeMode } from "../../lib/theme"
import { Asset, assetBg, assetSlotText } from "../../lib/infrastructure"

// Zero-U + Unplaced trays under the elevation (DCIM spec §2.1, Hyperview's
// bucket pattern). Zero-U kit counts toward power/weight but never U; Unplaced
// = in this cabinet with no position recorded.
function Tray({
  title, hint, assets, emptyText, selectedAssetId, onSelectAsset
}: {
  title: string; hint: string; assets: Asset[]; emptyText: string
  selectedAssetId: string | null; onSelectAsset: (id: string) => void
}) {
  const { mode } = useThemeMode()
  const isDark = mode === "dark"
  const text = assetSlotText(mode)
  return (
    <Box sx={{
      flex: 1, minWidth: 0, borderRadius: "6px", p: "8px 10px",
      bgcolor: isDark ? "#1e293b" : "#ffffff",
      border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: text.subtitle, mb: "6px" }}>
        {title} <Box component="span" sx={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· {hint}</Box>
      </Typography>
      {assets.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: text.subtitle }}>{emptyText}</Typography>
      ) : (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          {assets.map(a => (
            <Box
              key={a.id}
              onClick={() => onSelectAsset(a.id)}
              sx={{
                px: "8px", py: "3px", borderRadius: "4px", cursor: "pointer",
                bgcolor: assetBg(a.assetType, mode),
                border: selectedAssetId === a.id ? "1.5px solid #2563eb" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`
              }}
            >
              <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: text.title }}>{a.name}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}

export const ZeroUTray = React.memo(function ZeroUTray({
  zeroUAssets, unplacedAssets, selectedAssetId, onSelectAsset
}: {
  zeroUAssets: Asset[]; unplacedAssets: Asset[]
  selectedAssetId: string | null; onSelectAsset: (id: string) => void
}) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mt: "12px" }}>
      <Tray
        title="Zero-U" hint="counts power, not space"
        assets={zeroUAssets} emptyText="No side-mounted kit"
        selectedAssetId={selectedAssetId} onSelectAsset={onSelectAsset}
      />
      <Tray
        title="Unplaced" hint="in cabinet, position unknown"
        assets={unplacedAssets} emptyText="Everything is positioned"
        selectedAssetId={selectedAssetId} onSelectAsset={onSelectAsset}
      />
    </Stack>
  )
})
