import React from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogContent,
  DialogTitle, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

type Site = {
  id: string
  name: string
  city: string | null
  postcode: string | null
  country: string
  _count: { assets: number; surveys: number }
}

export default function SitesPage() {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [city, setCity] = React.useState("")
  const [postcode, setPostcode] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/sites")).data
  })

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.post("/sites", { name, city, postcode, address, country: "UK" })
      setOpen(false)
      setName(""); setCity(""); setPostcode(""); setAddress("")
      refetch()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Sites</Typography>
        <Button variant="contained" onClick={() => setOpen(true)}>Add site</Button>
      </Stack>

      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load sites" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="No sites yet" detail="Add a site to get started." />
          ) : null}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>City</TableCell>
                  <TableCell>Postcode</TableCell>
                  <TableCell>Assets</TableCell>
                  <TableCell>Surveys</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((site) => (
                  <TableRow key={site.id}>
                    <TableCell sx={{ fontWeight: 700 }}>{site.name}</TableCell>
                    <TableCell>{site.city ?? "—"}</TableCell>
                    <TableCell>{site.postcode ?? "—"}</TableCell>
                    <TableCell>{site._count.assets}</TableCell>
                    <TableCell>{site._count.surveys}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add site</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Site name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
            <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth />
            <Stack direction="row" gap={2}>
              <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
              <TextField label="Postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1 }}>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={saving || !name.trim()}>
                {saving ? "Saving..." : "Create site"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}