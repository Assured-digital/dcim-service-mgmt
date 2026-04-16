import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Dialog, DialogContent,
  DialogTitle, DialogActions, Stack, TextField, Typography
} from "@mui/material"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import StorageIcon from "@mui/icons-material/Storage"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import AddIcon from "@mui/icons-material/Add"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type Site = {
  id: string
  name: string
  address: string | null
  city: string | null
  postcode: string | null
  country: string
  notes: string | null
  _count: { assets: number; checks: number }
  cabinets: { id: string; usedU: number | null; totalU: number | null }[]
}

export default function AssetManagementPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [postcode, setPostcode] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/sites")).data
  })

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>("/sites", {
        name, address, city, postcode, country: "UK",
        notes: notes || undefined
      })
      setOpen(false)
      setName(""); setAddress(""); setCity(""); setPostcode(""); setNotes("")
      qc.invalidateQueries({ queryKey: ["sites"] })
      navigate(`/asset-management/${res.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mb: 2 }}>
        {canManage ? (
          <Button variant="contained" size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={() => setOpen(true)}>
            Add site
          </Button>
        ) : null}
      </Box>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load asset management data" /> : null}
      {!isLoading && !error && (data?.length ?? 0) === 0 ? (
        <EmptyState title="No sites yet" detail="Add a site to start tracking rooms, racks, assets and engineering checks." />
      ) : null}

      <Stack spacing={1.5}>
        {(data ?? []).map(site => {
          const totalUSpaces = site.cabinets.reduce((sum, cabinet) => sum + (cabinet.totalU ?? 0), 0)
          const filledUSpaces = site.cabinets.reduce((sum, cabinet) => sum + (cabinet.usedU ?? 0), 0)
          const utilisationPct = totalUSpaces > 0 ? Math.round((filledUSpaces / totalUSpaces) * 100) : 0
          return (
            <Card
              key={site.id}
              onClick={() => navigate(`/asset-management/${site.id}`)}
              sx={{
                cursor: "pointer",
                transition: "box-shadow 0.15s",
                "&:hover": { boxShadow: "0 4px 20px rgba(15,23,42,0.10)" }
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 1.5 }}>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: 2, bgcolor: "#e8f1ff",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                  }}>
                    <LocationOnIcon sx={{ fontSize: 18, color: "#1d4ed8" }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2} noWrap>
                      {site.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[site.city, site.postcode].filter(Boolean).join(", ") || site.country}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1, sm: 2 }} sx={{ mb: 0.75 }}>
                  <Box>
                    <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", color: "#94a3b8", textTransform: "uppercase" }}>
                      Utilisation
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                      {filledUSpaces}/{totalUSpaces} U filled ({utilisationPct}%)
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <StorageIcon sx={{ fontSize: 13, color: "#94a3b8" }} />
                    <Typography variant="caption" color="text.secondary">
                      {site.cabinets.length} rack{site.cabinets.length !== 1 ? "s" : ""}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <StorageIcon sx={{ fontSize: 13, color: "#94a3b8" }} />
                    <Typography variant="caption" color="text.secondary">
                      {site._count?.assets ?? 0} assets
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <FactCheckIcon sx={{ fontSize: 13, color: "#94a3b8" }} />
                    <Typography variant="caption" color="text.secondary">
                      {site._count?.checks ?? 0} checks
                    </Typography>
                  </Stack>
                </Stack>

                {site.notes ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {site.notes}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add site</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Site name" value={name} onChange={e => setName(e.target.value)} required fullWidth placeholder="e.g. DC1 Manchester" />
            <TextField label="Address" value={address} onChange={e => setAddress(e.target.value)} fullWidth />
            <Stack direction="row" spacing={2}>
              <TextField label="City" value={city} onChange={e => setCity(e.target.value)} fullWidth />
              <TextField label="Postcode" value={postcode} onChange={e => setPostcode(e.target.value)} fullWidth />
            </Stack>
            <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)} multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? "Creating..." : "Create site"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
