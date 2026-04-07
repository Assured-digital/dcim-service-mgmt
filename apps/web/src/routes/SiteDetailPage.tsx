import React from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography
} from "@mui/material"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { chipSx } from "../components/shared"
import { CreateTaskModal } from "./TasksPage"

type Cabinet = {
  id: string
  name: string
  type: string
  totalU: number | null
  usedU: number | null
  powerKw: number | null
  notes: string | null
}

type Asset = {
  id: string
  assetTag: string
  name: string
  assetType: string
  ownerType: string
  status: string
  lifecycleState: string | null
  manufacturer: string | null
  modelNumber: string | null
  serialNumber: string | null
  ipAddress: string | null
  uHeight: number | null
  uPosition: number | null
  powerDrawW: number | null
  warrantyExpiry: string | null
  notes: string | null
  location: string | null
}

type Check = {
  id: string
  reference: string
  title: string
  checkType: string
  status: string
  scheduledAt: string | null
  passRate: number | null
  createdAt: string
  assignee: { id: string; email: string } | null
}

type Site = {
  id: string
  name: string
  address: string | null
  city: string | null
  postcode: string | null
  country: string
  notes: string | null
  createdAt: string
  cabinets: Cabinet[]
  assets: Asset[]
  checks: Check[]
}

function statusColor(status: string) {
  if (status === "ACTIVE") return { bgcolor: "#e7f8ee", color: "#15803d", fontWeight: 700 }
  if (status === "IN_MAINTENANCE") return { bgcolor: "#fff5e8", color: "#b45309", fontWeight: 700 }
  if (status === "FAULTY") return { bgcolor: "#fdecec", color: "#b42318", fontWeight: 700 }
  if (status === "RETIRED") return { bgcolor: "#f1f5f9", color: "#64748b", fontWeight: 700 }
  return { bgcolor: "#f1f5f9", color: "#475569" }
}

export default function SiteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()
  const location = useLocation()
  const fromTask = location.state?.fromTask
  const fromTaskRef = location.state?.fromTaskRef

  const [tab, setTab] = React.useState(0)
  const [error, setError] = React.useState("")

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  const isOrgSuper = hasAnyRole([...ORG_SUPER_ROLES])

  // Asset modal state
  const [assetOpen, setAssetOpen] = React.useState(false)
  const [assetTag, setAssetTag] = React.useState("")
    const [assetName, setAssetName] = React.useState("")
    const [assetType, setAssetType] = React.useState("")
    const [assetStatus, setAssetStatus] = React.useState("ACTIVE")
    const [assetManufacturer, setAssetManufacturer] = React.useState("")
    const [assetModel, setAssetModel] = React.useState("")
    const [assetSerial, setAssetSerial] = React.useState("")
    const [assetIp, setAssetIp] = React.useState("")
    const [assetUHeight, setAssetUHeight] = React.useState("")
    const [assetUPosition, setAssetUPosition] = React.useState("")
    const [assetPowerW, setAssetPowerW] = React.useState("")
    const [assetWarranty, setAssetWarranty] = React.useState("")
    const [assetNotes, setAssetNotes] = React.useState("")
    const [savingAsset, setSavingAsset] = React.useState(false)
    const [taskOpen, setTaskOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [importResult, setImportResult] = React.useState<{
    created: number; updated: number; skipped: number; errors: string[]
  } | null>(null)
  const [dragOver, setDragOver] = React.useState(false)

  // Cabinet modal state
  const [cabinetOpen, setCabinetOpen] = React.useState(false)
  const [cabinetName, setCabinetName] = React.useState("")
  const [cabinetType, setCabinetType] = React.useState("RACK")
  const [totalU, setTotalU] = React.useState("")
  const [powerKw, setPowerKw] = React.useState("")
  const [savingCabinet, setSavingCabinet] = React.useState(false)

  // Delete asset state
  const [deleteAsset, setDeleteAsset] = React.useState<Asset | null>(null)

  const { data: site, isLoading } = useQuery({
    queryKey: ["site-detail", id],
    queryFn: async () => (await api.get<Site>(`/sites/${id}`)).data,
    enabled: !!id
  })

  const removeMutation = useMutation({
    mutationFn: async (assetId: string) => (await api.delete(`/assets/${assetId}`)).data,
    onSuccess: async () => {
      setDeleteAsset(null)
      qc.invalidateQueries({ queryKey: ["site-detail", id] })
      qc.invalidateQueries({ queryKey: ["assets"] })
    }
  })

  async function handleAddAsset() {
    if (!assetTag.trim() || !assetName.trim() || !assetType.trim()) return
    setSavingAsset(true)
    setError("")
    try {
        await api.post("/assets", {
        assetTag,
        name: assetName,
        assetType,
        ownerType: "CLIENT",
        status: assetStatus,
        siteId: id,
        manufacturer: assetManufacturer || undefined,
        modelNumber: assetModel || undefined,
        serialNumber: assetSerial || undefined,
        ipAddress: assetIp || undefined,
        uHeight: assetUHeight ? parseInt(assetUHeight) : undefined,
        uPosition: assetUPosition ? parseInt(assetUPosition) : undefined,
        powerDrawW: assetPowerW ? parseFloat(assetPowerW) : undefined,
        warrantyExpiry: assetWarranty || undefined,
        notes: assetNotes || undefined
        })
        setAssetTag(""); setAssetName(""); setAssetType("")
        setAssetStatus("ACTIVE"); setAssetManufacturer("")
        setAssetModel(""); setAssetSerial(""); setAssetIp("")
        setAssetUHeight(""); setAssetUPosition("")
        setAssetPowerW(""); setAssetWarranty(""); setAssetNotes("")
        setAssetOpen(false)
        qc.invalidateQueries({ queryKey: ["site-detail", id] })
        qc.invalidateQueries({ queryKey: ["assets"] })
    } catch (e: any) {
        setError(e?.message ?? "Failed to create asset")
    } finally {
        setSavingAsset(false)
    }
  }

  async function handleExport() {
    try {
      const response = await api.get(`/assets/site/${id}/export`, {
        responseType: "blob"
      })
      const url = URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement("a")
      a.href = url
      a.download = `assets-${site.name}-${new Date().toISOString().split("T")[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError("Failed to export assets")
    }
  }

  async function handleImport() {
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    setError("")
    try {
      const text = await importFile.text()
      const lines = text.trim().split("\n").filter(l => l.trim())
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""))
      const rows = lines.slice(1).map(line => {
        const values = line.match(/(".*?"|[^,]+)(?=,|$)/g) ?? []
        return Object.fromEntries(
          headers.map((h, i) => [h, (values[i] ?? "").replace(/^"|"$/g, "").trim()])
        )
      }).filter(row => Object.values(row).some(v => v !== ""))
      const result = await api.post(`/assets/site/${id}/import`, { rows })
      setImportResult(result.data)
      qc.invalidateQueries({ queryKey: ["site-detail", id] })
      qc.invalidateQueries({ queryKey: ["assets"] })
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Import failed")
    } finally {
      setImporting(false)
    }
  }

  async function handleAddCabinet() {
    if (!cabinetName.trim()) return
    setSavingCabinet(true)
    setError("")
    try {
      await api.post(`/sites/${id}/cabinets`, {
        name: cabinetName,
        type: cabinetType,
        totalU: totalU ? parseInt(totalU) : undefined,
        powerKw: powerKw ? parseFloat(powerKw) : undefined
      })
      setCabinetName(""); setCabinetType("RACK"); setTotalU(""); setPowerKw("")
      setCabinetOpen(false)
      qc.invalidateQueries({ queryKey: ["site-detail", id] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to create cabinet")
    } finally {
      setSavingCabinet(false)
    }
  }

  React.useEffect(() => { if (site) setRecordLabel(site.name) }, [site]) // eslint-disable-line
  if (isLoading) return <LoadingState />
  if (!site) return <ErrorState title="Site not found" />

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <LocationOnIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">
              {[site.address, site.city, site.postcode, site.country].filter(Boolean).join(", ")}
            </Typography>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{site.name}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small"
            onClick={() => setTaskOpen(true)}>
            Create task
          </Button>
          <Button variant="outlined" size="small"
            onClick={() => navigate("/checks")}>
            Schedule check
          </Button>
          {tab === 0 && canManage ? (
            <Button variant="contained" size="small" onClick={() => setAssetOpen(true)}>
              Add asset
            </Button>
          ) : null}
          {tab === 1 && canManage ? (
            <Button variant="contained" size="small" onClick={() => setCabinetOpen(true)}>
              Add cabinet
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: "1px solid #e2e8f0" }}>
        <Tab label={`Assets (${site.assets.length})`} />
        <Tab label={`Cabinets (${site.cabinets.length})`} />
        <Tab label={`Engineering Checks (${site.checks.length})`} />
      </Tabs>

      {/* Assets tab */}
      {tab === 0 ? (
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography sx={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                color: "var(--color-text-tertiary)"
              }}>
                ASSETS — {site.assets.length}
              </Typography>
              {canManage ? (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined"
                    onClick={() => setImportOpen(true)}>
                    Import CSV
                  </Button>
                  <Button size="small" variant="outlined"
                    onClick={handleExport}>
                    Export CSV
                  </Button>
                  <Button size="small" variant="contained"
                    onClick={() => setAssetOpen(true)}>
                    Add asset
                  </Button>
                </Stack>
              ) : null}
            </Stack>
            {site.assets.length === 0 ? (
              <EmptyState title="No assets at this site"
                detail="Add an asset to start tracking infrastructure here." />
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Asset tag</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Manufacturer</TableCell>
                      <TableCell>Serial</TableCell>
                      <TableCell>IP</TableCell>
                      <TableCell>U pos</TableCell>
                      <TableCell>Status</TableCell>
                      {canManage ? <TableCell align="right">Action</TableCell> : null}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {site.assets.map((a) => (
                      <TableRow key={a.id} hover>
                        <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>
                          {a.assetTag}
                        </TableCell>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>{a.assetType}</TableCell>
                        <TableCell>{a.manufacturer ?? "—"}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {a.serialNumber ?? "—"}
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {a.ipAddress ?? "—"}
                        </TableCell>
                        <TableCell>{a.uPosition != null ? `U${a.uPosition}` : "—"}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Chip size="small" sx={chipSx(a.status)}
                              label={a.status.toLowerCase().replace("_", " ")} />
                            {a.lifecycleState && a.lifecycleState !== "ACTIVE" ? (
                              <Chip size="small"
                                sx={{ bgcolor: "#f1f5f9", color: "#475569", fontSize: 10 }}
                                label={a.lifecycleState.toLowerCase()} />
                            ) : null}
                          </Stack>
                        </TableCell>
                        {canManage ? (
                          <TableCell align="right">
                            <Button size="small" color="error" variant="outlined"
                              onClick={() => setDeleteAsset(a)}>
                              Delete
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Cabinets tab */}
      {tab === 1 ? (
        <Card>
          <CardContent>
            {site.cabinets.length === 0 ? (
              <EmptyState title="No cabinets at this site"
                detail="Add a cabinet to track rack space and power." />
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Total U</TableCell>
                      <TableCell>Used U</TableCell>
                      <TableCell>Power (kW)</TableCell>
                      <TableCell>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {site.cabinets.map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell sx={{ fontWeight: 700 }}>{c.name}</TableCell>
                        <TableCell>{c.type}</TableCell>
                        <TableCell>{c.totalU ?? "—"}</TableCell>
                        <TableCell>{c.usedU ?? "—"}</TableCell>
                        <TableCell>{c.powerKw ?? "—"}</TableCell>
                        <TableCell>{c.notes ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Engineering Checks tab */}
      {tab === 2 ? (
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography sx={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                color: "var(--color-text-tertiary)"
              }}>
                ENGINEERING CHECKS
              </Typography>
              {canManage ? (
                <Button size="small" variant="outlined"
                  onClick={() => navigate("/checks", { state: { siteId: site.id } })}>
                  Schedule check
                </Button>
              ) : null}
            </Stack>
            {site.checks.length === 0 ? (
              <EmptyState title="No checks at this site"
                detail="Engineering checks scheduled at this site will appear here." />
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Reference</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Pass rate</TableCell>
                      <TableCell>Scheduled</TableCell>
                      <TableCell>Assignee</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {site.checks.map((c) => (
                      <TableRow key={c.id} hover
                        onClick={() => navigate(`/checks/${c.id}`)}
                        sx={{ cursor: "pointer" }}>
                        <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>
                          {c.reference}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{c.title}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">{c.checkType}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" sx={chipSx(c.status)}
                            label={c.status.toLowerCase().replace("_", " ")} />
                        </TableCell>
                        <TableCell>
                          {c.passRate !== null ? (
                            <Chip size="small"
                              sx={chipSx(c.passRate >= 80 ? "COMPLETED" : c.passRate >= 60 ? "AMBER" : "FAIL")}
                              label={`${c.passRate}%`} />
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {c.scheduledAt
                              ? new Date(c.scheduledAt).toLocaleDateString("en-GB")
                              : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {c.assignee?.email.split("@")[0] ?? "Unassigned"}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Add asset modal */}
      <Dialog open={assetOpen} onClose={() => setAssetOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add asset to {site.name}</DialogTitle>
        <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2}>
                <TextField label="Asset tag" value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)} required fullWidth />
                <TextField label="Name" value={assetName}
                onChange={(e) => setAssetName(e.target.value)} required fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
                <TextField label="Type" value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
                placeholder="Server, Switch, UPS, PDU..." required fullWidth />
                <TextField select label="Status" value={assetStatus}
                onChange={(e) => setAssetStatus(e.target.value)} fullWidth>
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="IN_MAINTENANCE">In maintenance</MenuItem>
                <MenuItem value="FAULTY">Faulty</MenuItem>
                <MenuItem value="RETIRED">Retired</MenuItem>
                </TextField>
            </Stack>
            <Stack direction="row" spacing={2}>
                <TextField label="Manufacturer" value={assetManufacturer}
                onChange={(e) => setAssetManufacturer(e.target.value)} fullWidth />
                <TextField label="Model number" value={assetModel}
                onChange={(e) => setAssetModel(e.target.value)} fullWidth />
                <TextField label="Serial number" value={assetSerial}
                onChange={(e) => setAssetSerial(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
                <TextField label="IP address" value={assetIp}
                onChange={(e) => setAssetIp(e.target.value)} fullWidth />
                <TextField label="U height" value={assetUHeight} type="number"
                onChange={(e) => setAssetUHeight(e.target.value)} fullWidth />
                <TextField label="U position" value={assetUPosition} type="number"
                onChange={(e) => setAssetUPosition(e.target.value)} fullWidth />
                <TextField label="Power draw (W)" value={assetPowerW} type="number"
                onChange={(e) => setAssetPowerW(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
                <TextField label="Warranty expiry" type="date"
                value={assetWarranty} onChange={(e) => setAssetWarranty(e.target.value)}
                fullWidth InputLabelProps={{ shrink: true }} />
                <TextField label="Notes" value={assetNotes}
                onChange={(e) => setAssetNotes(e.target.value)} fullWidth />
            </Stack>
            </Stack>
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setAssetOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleAddAsset}
            disabled={savingAsset || !assetTag.trim() || !assetName.trim() || !assetType.trim()}>
            {savingAsset ? "Saving..." : "Add asset"}
            </Button>
        </DialogActions>
        </Dialog>

      {/* Add cabinet modal */}
      <Dialog open={cabinetOpen} onClose={() => setCabinetOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add cabinet to {site.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField label="Cabinet name" value={cabinetName}
                onChange={(e) => setCabinetName(e.target.value)} required fullWidth />
              <TextField select label="Type" value={cabinetType}
                onChange={(e) => setCabinetType(e.target.value)} fullWidth>
                <MenuItem value="RACK">Rack</MenuItem>
                <MenuItem value="OPEN_FRAME">Open frame</MenuItem>
                <MenuItem value="WALL_MOUNT">Wall mount</MenuItem>
              </TextField>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="Total U" value={totalU} type="number"
                onChange={(e) => setTotalU(e.target.value)} fullWidth />
              <TextField label="Power (kW)" value={powerKw} type="number"
                onChange={(e) => setPowerKw(e.target.value)} fullWidth />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCabinetOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddCabinet}
            disabled={savingCabinet || !cabinetName.trim()}>
            {savingCabinet ? "Saving..." : "Add cabinet"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete asset confirm */}
      <Dialog open={!!deleteAsset} onClose={() => setDeleteAsset(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete asset</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete <strong>{deleteAsset?.assetTag}</strong> — {deleteAsset?.name}.
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAsset(null)}>Cancel</Button>
          <Button color="error" variant="contained"
            disabled={removeMutation.isPending}
            onClick={() => deleteAsset && removeMutation.mutate(deleteAsset.id)}>
            {removeMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        linkedEntityType="Site"
        linkedEntityId={site.id}
        linkedEntityLabel={site.name}
      />

      <Dialog open={importOpen} onClose={() => {
        if (importing) return
        setImportOpen(false)
        setImportFile(null)
        setImportResult(null)
        setError("")
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Import assets from Hyperview</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>

            {/* Info banner */}
            <Box sx={{
              p: 1.5, borderRadius: 1.5,
              bgcolor: "#eff6ff", border: "1px solid #bfdbfe"
            }}>
              <Typography variant="caption" color="#1d4ed8" fontWeight={600} sx={{ display: "block", mb: 0.5 }}>
                Hyperview — Contained Assets export
              </Typography>
              <Typography variant="caption" color="#1d4ed8">
                Export from Hyperview using <strong>Assets → Contained Assets → Export CSV</strong>.
                Assets are matched by Asset ID then Serial Number. Existing records are updated,
                new records are created.
              </Typography>
            </Box>

            {/* Drop zone */}
            {!importResult ? (
              <Box
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file && (file.name.endsWith(".csv") || file.name.endsWith(".xlsx"))) {
                    setImportFile(file)
                  } else {
                    setError("Please drop a CSV file")
                  }
                }}
                onClick={() => {
                  const input = document.createElement("input")
                  input.type = "file"
                  input.accept = ".csv"
                  input.onchange = (e: any) => {
                    const file = e.target.files?.[0]
                    if (file) setImportFile(file)
                  }
                  input.click()
                }}
                sx={{
                  border: `2px dashed`,
                  borderColor: dragOver ? "#3b82f6" : importFile ? "#22c55e" : "var(--color-border-tertiary)",
                  borderRadius: 2,
                  p: 4,
                  textAlign: "center",
                  cursor: "pointer",
                  bgcolor: dragOver ? "#eff6ff"
                    : importFile ? "#f0fdf4"
                    : "var(--color-background-secondary)",
                  transition: "all 0.15s",
                  "&:hover": {
                    borderColor: "#3b82f6",
                    bgcolor: "#eff6ff"
                  }
                }}
              >
                {importFile ? (
                  <Stack spacing={0.75} alignItems="center">
                    <Box sx={{
                      width: 40, height: 40, borderRadius: "50%",
                      bgcolor: "#dcfce7", display: "flex",
                      alignItems: "center", justifyContent: "center"
                    }}>
                      <Typography sx={{ fontSize: 18 }}>✓</Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600} color="#15803d">
                      {importFile.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(importFile.size / 1024).toFixed(1)} KB — click to change
                    </Typography>
                  </Stack>
                ) : (
                  <Stack spacing={0.75} alignItems="center">
                    <Box sx={{
                      width: 40, height: 40, borderRadius: "50%",
                      bgcolor: "#f1f5f9", display: "flex",
                      alignItems: "center", justifyContent: "center"
                    }}>
                      <Typography sx={{ fontSize: 18 }}>📄</Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600}>
                      Drop CSV file here
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      or click to browse
                    </Typography>
                  </Stack>
                )}
              </Box>
            ) : null}

            {/* Result */}
            {importResult ? (
              <Box sx={{
                p: 2, borderRadius: 1.5,
                bgcolor: "#f0fdf4", border: "1px solid #bbf7d0"
              }}>
                <Typography variant="body2" fontWeight={700} color="#15803d" sx={{ mb: 1.5 }}>
                  Import complete
                </Typography>
                <Stack direction="row" spacing={3}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h5" fontWeight={700} color="#15803d">
                      {importResult.created}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Created</Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h5" fontWeight={700} color="#0369a1">
                      {importResult.updated}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Updated</Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h5" fontWeight={700} color="#64748b">
                      {importResult.skipped}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Skipped</Typography>
                  </Box>
                </Stack>
                {importResult.errors.length > 0 ? (
                  <Box sx={{
                    mt: 1.5, p: 1.25, borderRadius: 1,
                    bgcolor: "#fef2f2", border: "1px solid #fecaca"
                  }}>
                    <Typography variant="caption" fontWeight={600} color="#b91c1c" sx={{ display: "block", mb: 0.5 }}>
                      {importResult.errors.length} row error{importResult.errors.length > 1 ? "s" : ""}
                    </Typography>
                    {importResult.errors.slice(0, 5).map((e, i) => (
                      <Typography key={i} variant="caption" color="#b91c1c" sx={{ display: "block" }}>
                        {e}
                      </Typography>
                    ))}
                  </Box>
                ) : null}
              </Box>
            ) : null}

            {error ? (
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fef2f2", border: "1px solid #fecaca" }}>
                <Typography variant="caption" color="#b91c1c">{error}</Typography>
              </Box>
            ) : null}

          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setImportOpen(false)
            setImportFile(null)
            setImportResult(null)
            setError("")
          }} disabled={importing}>
            {importResult ? "Close" : "Cancel"}
          </Button>
          {!importResult ? (
            <Button variant="contained" onClick={handleImport}
              disabled={importing || !importFile}>
              {importing ? "Importing..." : "Import assets"}
            </Button>
          ) : (
            <Button variant="outlined" onClick={() => {
              setImportFile(null)
              setImportResult(null)
            }}>
              Import another file
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  )
}