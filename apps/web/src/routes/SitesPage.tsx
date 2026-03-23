import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Dialog, DialogContent,
  DialogTitle, Grid, Stack, TextField, Typography
} from "@mui/material"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import StorageIcon from "@mui/icons-material/Storage"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import ViewModuleIcon from "@mui/icons-material/ViewModule"
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
  _count: { assets: number; surveys: number }
  cabinets: { id: string }[]
}

export default function SitesPage() {
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
      await api.post("/sites", {
        name, address, city, postcode, country: "UK",
        notes: notes || undefined
      })
      setOpen(false)
      setName(""); setAddress(""); setCity("")
      setPostcode(""); setNotes("")
      qc.invalidateQueries({ queryKey: ["sites"] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4">Sites</Typography>
          <Typography variant="body2" color="text.secondary">
            Physical locations for the selected client
          </Typography>
        </Box>
        {canManage ? (
          <Button variant="contained" onClick={() => setOpen(true)}>Add site</Button>
        ) : null}
      </Stack>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load sites" /> : null}
      {!isLoading && !error && (data?.length ?? 0) === 0 ? (
        <EmptyState title="No sites yet"
          detail="Add a site to start tracking assets, cabinets and surveys." />
      ) : null}

      <Grid container spacing={2}>
        {(data ?? []).map((site) => (
          <Grid item xs={12} sm={6} md={4} key={site.id}>
            <Card
              onClick={() => navigate(`/sites/${site.id}`)}
              sx={{
                cursor: "pointer",
                height: "100%",
                transition: "box-shadow 0.15s",
                "&:hover": { boxShadow: "0 4px 20px rgba(15,23,42,0.10)" }
              }}
            >
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1.5 }}>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: 2,
                    bgcolor: "#e8f1ff", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0
                  }}>
                    <LocationOnIcon sx={{ fontSize: 18, color: "#1d4ed8" }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                      {site.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[site.city, site.postcode].filter(Boolean).join(", ") || site.country}
                    </Typography>
                  </Box>
                </Stack>

                {site.notes ? (
                  <Typography variant="body2" color="text.secondary"
                    sx={{ mb: 1.5, fontSize: 12,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" }}>
                    {site.notes}
                  </Typography>
                ) : null}

                <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <StorageIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary">
                      {site._count.assets} assets
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <ViewModuleIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary">
                      {site.cabinets.length} cabinets
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <FactCheckIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary">
                      {site._count.surveys} surveys
                    </Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add site</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Site name" value={name}
              onChange={(e) => setName(e.target.value)} required fullWidth />
            <TextField label="Address" value={address}
              onChange={(e) => setAddress(e.target.value)} fullWidth />
            <Stack direction="row" gap={2}>
              <TextField label="City" value={city}
                onChange={(e) => setCity(e.target.value)} fullWidth />
              <TextField label="Postcode" value={postcode}
                onChange={(e) => setPostcode(e.target.value)} fullWidth />
            </Stack>
            <TextField label="Notes" value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline rows={2} fullWidth />
            <Stack direction="row" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate}
                disabled={saving || !name.trim()}>
                {saving ? "Saving..." : "Create site"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}