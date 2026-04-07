import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Dialog, DialogContent,
  DialogTitle, DialogActions, Grid, Stack, TextField, Typography
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
  cabinets: { id: string }[]
}

export default function InfrastructurePage() {
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
      navigate(`/infrastructure/${res.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 400, lineHeight: 1.2 }}>Infrastructure</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: "4px" }}>
            Physical sites, rooms, racks and assets for the selected client
          </Typography>
        </Box>
        {canManage ? (
          <Button variant="contained" size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => setOpen(true)}>
            Add site
          </Button>
        ) : null}
      </Box>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load infrastructure" /> : null}
      {!isLoading && !error && (data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No sites yet"
          detail="Add a site to start tracking rooms, racks, assets and engineering checks." />
      ) : null}

      <Grid container spacing={2}>
        {(data ?? []).map(site => (
          <Grid item xs={12} sm={6} md={4} key={site.id}>
            <Card
              onClick={() => navigate(`/infrastructure/${site.id}`)}
              sx={{
                cursor: "pointer", height: "100%",
                transition: "box-shadow 0.15s",
                "&:hover": { boxShadow: "0 4px 20px rgba(15,23,42,0.10)" }
              }}
            >
              <CardContent>
                {/* Icon + name */}
                <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: 2,
                    bgcolor: "#e8f1ff", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0
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

                {/* Stats */}
                <Stack direction="row" spacing={2}>
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
                  <Typography variant="caption" color="text.secondary"
                    sx={{ mt: 1.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {site.notes}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Add site dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add site</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Site name" value={name}
              onChange={e => setName(e.target.value)} required fullWidth
              placeholder="e.g. DC1 Manchester" />
            <TextField label="Address" value={address}
              onChange={e => setAddress(e.target.value)} fullWidth />
            <Stack direction="row" spacing={2}>
              <TextField label="City" value={city}
                onChange={e => setCity(e.target.value)} fullWidth />
              <TextField label="Postcode" value={postcode}
                onChange={e => setPostcode(e.target.value)} fullWidth />
            </Stack>
            <TextField label="Notes" value={notes}
              onChange={e => setNotes(e.target.value)}
              multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || !name.trim()}>
            {saving ? "Creating..." : "Create site"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}