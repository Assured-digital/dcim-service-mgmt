import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, Chip, Dialog, DialogContent, DialogTitle,
  MenuItem, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { chipSx } from "../components/shared"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type CheckTemplate = {
  id: string
  reference: string
  name: string
  checkType: string
  description: string | null
  isActive: boolean
  estimatedMinutes: number | null
  createdAt: string
  items: { id: string }[]
}

const CHECK_TYPES = [
  "Rack Audit",
  "Site Walkthrough",
  "UPS Health Check",
  "Fire Suppression Inspection",
  "Environmental Monitoring Review",
  "Cable Management Audit",
  "Security & Access Review",
  "Cooling System Check",
  "PAT Testing",
  "Other"
]

export default function CheckTemplatesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const [createOpen, setCreateOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [checkType, setCheckType] = React.useState("")
  const [customType, setCustomType] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [estimatedMinutes, setEstimatedMinutes] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["check-templates"],
    queryFn: async () => (await api.get<CheckTemplate[]>("/checks/templates")).data
  })

  function resetForm() {
    setName(""); setCheckType(""); setCustomType("")
    setDescription(""); setEstimatedMinutes(""); setError("")
  }

  async function handleCreate() {
    const resolvedType = checkType === "Other" ? customType.trim() : checkType
    if (!name.trim() || !resolvedType) return
    setSaving(true)
    setError("")
    try {
      const res = await api.post("/checks/templates", {
        name: name.trim(),
        checkType: resolvedType,
        description: description.trim() || undefined,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined
      })
      setCreateOpen(false)
      resetForm()
      qc.invalidateQueries({ queryKey: ["check-templates"] })
      navigate(`/check-templates/${res.data.id}`)
    } catch (e: any) {
      setError(e?.message ?? "Failed to create template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Card>
        <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2, py: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography color="text.secondary" variant="body2">
            Reusable checklists applied when scheduling engineering checks.
          </Typography>
          {canManage ? (
            <Button size="small" variant="contained" onClick={() => setCreateOpen(true)}>
              New template
            </Button>
          ) : null}
        </Box>
        {isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {isError ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load templates" /></Box> : null}
        {!isLoading && !isError && (data?.length ?? 0) === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState
              title="No templates yet"
              detail="Create a template to define a reusable checklist for engineering checks."
            />
          </Box>
        ) : null}
        {(data?.length ?? 0) > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Items</TableCell>
                  <TableCell>Est. duration</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((t) => (
                  <TableRow
                    key={t.id}
                    onClick={() => navigate(`/check-templates/${t.id}`)}
                    sx={{ cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>
                      {t.reference}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{t.name}</Typography>
                      {t.description ? (
                        <Typography variant="caption" color="text.secondary">
                          {t.description.length > 60
                            ? t.description.slice(0, 60) + "..."
                            : t.description}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={chipSx("active")} label={t.checkType} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{t.items.length} items</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {t.estimatedMinutes ? `${t.estimatedMinutes} min` : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small"
                        label="Global"
                        sx={{ bgcolor: "#f1f5f9", color: "#475569", fontSize: 11 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(t.createdAt).toLocaleDateString("en-GB")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); resetForm() }}
        maxWidth="sm" fullWidth>
        <DialogTitle>New check template</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? (
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fef2f2", border: "1px solid #fecaca" }}>
                <Typography variant="caption" color="#b91c1c">{error}</Typography>
              </Box>
            ) : null}
            <TextField label="Template name" value={name}
              onChange={(e) => setName(e.target.value)} required fullWidth
              placeholder="e.g. Standard Rack Audit" />
            <TextField select label="Check type" value={checkType}
              onChange={(e) => setCheckType(e.target.value)} required fullWidth>
              <MenuItem value="">Select a type...</MenuItem>
              {CHECK_TYPES.map(t => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            {checkType === "Other" ? (
              <TextField label="Custom type" value={customType}
                onChange={(e) => setCustomType(e.target.value)} required fullWidth
                placeholder="e.g. Sprinkler System Inspection" />
            ) : null}
            <TextField label="Description (optional)" value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline rows={2} fullWidth
              placeholder="Brief description of what this template covers..." />
            <TextField label="Estimated duration (minutes, optional)"
              type="number" value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)} fullWidth />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => { setCreateOpen(false); resetForm() }}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate}
                disabled={saving || !name.trim() || !checkType || (checkType === "Other" && !customType.trim())}>
                {saving ? "Creating..." : "Create template"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}