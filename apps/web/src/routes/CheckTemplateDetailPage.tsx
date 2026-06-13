import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, MenuItem, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import EditIcon from "@mui/icons-material/Edit"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import DragIndicatorIcon from "@mui/icons-material/DragIndicator"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import { InfoField, PanelCard, SectionHeader, chipSx } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type TemplateItem = {
  id: string
  sortOrder: number
  section: string | null
  label: string
  guidance: string | null
  responseType: string
  isRequired: boolean
  isCritical: boolean
}

type CheckTemplate = {
  id: string
  reference: string
  name: string
  checkType: string
  description: string | null
  isActive: boolean
  estimatedMinutes: number | null
  createdAt: string
  updatedAt: string
  items: TemplateItem[]
}

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  PASS_FAIL: "Pass / Fail",
  PASS_FAIL_NA: "Pass / Fail / N/A"
}

function ItemFormDialog({
  open,
  onClose,
  onSave,
  initial,
  nextSortOrder,
  existingSections
}: {
  open: boolean
  onClose: () => void
  onSave: (data: any) => Promise<void>
  initial?: TemplateItem
  nextSortOrder: number
  existingSections: string[]
}) {
  const [label, setLabel] = React.useState(initial?.label ?? "")
  const [section, setSection] = React.useState(initial?.section ?? "")
  const [guidance, setGuidance] = React.useState(initial?.guidance ?? "")
  const [responseType, setResponseType] = React.useState(initial?.responseType ?? "PASS_FAIL")
  const [isRequired, setIsRequired] = React.useState(initial?.isRequired ?? true)
  const [isCritical, setIsCritical] = React.useState(initial?.isCritical ?? false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? "")
      setSection(initial?.section ?? "")
      setGuidance(initial?.guidance ?? "")
      setResponseType(initial?.responseType ?? "PASS_FAIL")
      setIsRequired(initial?.isRequired ?? true)
      setIsCritical(initial?.isCritical ?? false)
      setError("")
    }
  }, [open, initial])

  async function handleSave() {
    if (!label.trim()) return
    setSaving(true)
    setError("")
    try {
      await onSave({
        label: label.trim(),
        section: section.trim() || undefined,
        guidance: guidance.trim() || undefined,
        responseType,
        isRequired,
        isCritical,
        sortOrder: initial?.sortOrder ?? nextSortOrder
      })
      onClose()
    } catch (e: any) {
      setError(e?.message ?? "Failed to save item")
    } finally {
      setSaving(false)
    }
  }

  const uniqueSections = [...new Set(existingSections.filter(Boolean))]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? "Edit checklist item" : "Add checklist item"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error ? (
            <Alert severity="error">{error}</Alert>
          ) : null}
          <TextField label="Item label" value={label}
            onChange={(e) => setLabel(e.target.value)} required fullWidth
            placeholder="e.g. Verify rack door closes and latches securely" />
          <TextField label="Section (optional)" value={section}
            onChange={(e) => setSection(e.target.value)} fullWidth
            placeholder="e.g. Physical, Cabling, Power"
            helperText={uniqueSections.length > 0
              ? `Existing sections: ${uniqueSections.join(", ")}`
              : undefined} />
          <TextField label="Guidance (optional)" value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            multiline rows={2} fullWidth
            placeholder="Help text shown to the engineer during execution..." />
          <TextField select label="Response type" value={responseType}
            onChange={(e) => setResponseType(e.target.value)} fullWidth>
            <MenuItem value="PASS_FAIL">Pass / Fail</MenuItem>
            <MenuItem value="PASS_FAIL_NA">Pass / Fail / N/A</MenuItem>
          </TextField>
          <Stack direction="row" spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Required
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small"
                  variant={isRequired ? "contained" : "outlined"}
                  onClick={() => setIsRequired(true)}>
                  Yes
                </Button>
                <Button size="small"
                  variant={!isRequired ? "contained" : "outlined"}
                  onClick={() => setIsRequired(false)}>
                  No
                </Button>
              </Stack>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Critical
                </Typography>
                <Tooltip
                  title="Critical items that fail will prompt the engineer to create a follow-on action immediately."
                  placement="top" arrow>
                  <WarningAmberIcon sx={{ fontSize: 13, color: "#f59e0b" }} />
                </Tooltip>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button size="small"
                  variant={isCritical ? "contained" : "outlined"}
                  color={isCritical ? "error" : "inherit"}
                  onClick={() => setIsCritical(true)}>
                  Yes
                </Button>
                <Button size="small"
                  variant={!isCritical ? "contained" : "outlined"}
                  onClick={() => setIsCritical(false)}>
                  No
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}
          disabled={saving || !label.trim()}>
          {saving ? "Saving..." : initial ? "Save changes" : "Add item"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function CheckTemplateDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const [error, setError] = React.useState("")
  const [addItemOpen, setAddItemOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<TemplateItem | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<TemplateItem | null>(null)
  const [deactivateOpen, setDeactivateOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [deactivating, setDeactivating] = React.useState(false)

  // Edit template metadata
  const [editingMeta, setEditingMeta] = React.useState(false)
  const [editName, setEditName] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editEstimatedMinutes, setEditEstimatedMinutes] = React.useState("")
  const [savingMeta, setSavingMeta] = React.useState(false)

  const { data: template, isLoading } = useQuery({
    queryKey: ["check-template-detail", id],
    queryFn: async () => (await api.get<CheckTemplate>(`/checks/templates/${id}`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (template) {
      setEditName(template.name)
      setEditDescription(template.description ?? "")
      setEditEstimatedMinutes(template.estimatedMinutes?.toString() ?? "")
    }
  }, [template])

  async function handleAddItem(data: any) {
    await api.post(`/checks/templates/${id}/items`, data)
    qc.invalidateQueries({ queryKey: ["check-template-detail", id] })
    qc.invalidateQueries({ queryKey: ["check-templates"] })
  }

  async function handleEditItem(data: any) {
    await api.put(`/checks/templates/${id}/items/${editItem!.id}`, data)
    qc.invalidateQueries({ queryKey: ["check-template-detail", id] })
  }

  async function handleDeleteItem() {
    if (!deleteItem) return
    setDeleting(true)
    try {
      await api.delete(`/checks/templates/${id}/items/${deleteItem.id}`)
      setDeleteItem(null)
      qc.invalidateQueries({ queryKey: ["check-template-detail", id] })
      qc.invalidateQueries({ queryKey: ["check-templates"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete item")
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveMeta() {
    setSavingMeta(true)
    setError("")
    try {
      await api.put(`/checks/templates/${id}`, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        estimatedMinutes: editEstimatedMinutes ? parseInt(editEstimatedMinutes) : undefined
      })
      setEditingMeta(false)
      qc.invalidateQueries({ queryKey: ["check-template-detail", id] })
      qc.invalidateQueries({ queryKey: ["check-templates"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally {
      setSavingMeta(false)
    }
  }

  async function handleDeactivate() {
    setDeactivating(true)
    try {
      await api.delete(`/checks/templates/${id}`)
      navigate("/check-templates")
    } catch (e: any) {
      setError(e?.message ?? "Failed to deactivate template")
    } finally {
      setDeactivating(false)
    }
  }

  React.useEffect(() => { if (template) setRecordLabel(template.name) }, [template]) // eslint-disable-line
  if (isLoading) return <LoadingState />
  if (!template) return <ErrorState title="Template not found" />

  const sections = [...new Set(template.items.map(i => i.section ?? "General"))]
  const nextSortOrder = (template.items[template.items.length - 1]?.sortOrder ?? 0) + 1

  const itemsBySection: Record<string, TemplateItem[]> = {}
  template.items.forEach(item => {
    const key = item.section ?? "General"
    if (!itemsBySection[key]) itemsBySection[key] = []
    itemsBySection[key].push(item)
  })

  return (
    <Box>
      {/* Top bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{
            display: "flex", alignItems: "center", gap: 1,
            px: 1.5, py: 0.75, borderRadius: 2,
            bgcolor: "var(--color-background-primary)",
            border: "1px solid var(--color-border-secondary)",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)"
          }}>
            <Typography sx={{
              fontFamily: "monospace", fontSize: 12, fontWeight: 700,
              color: "var(--color-text-secondary)", whiteSpace: "nowrap"
            }}>
              {template.reference}
            </Typography>
            <Box sx={{ width: 1, height: 14, bgcolor: "var(--color-border-tertiary)" }} />
            <Chip size="small" sx={{ bgcolor: "#e8f1ff", color: "primary.main", fontWeight: 600 }} label={template.checkType} />
            <Chip size="small"
              label={`${template.items.length} items`}
              sx={{ bgcolor: "#f1f5f9", color: "#475569" }} />
          </Box>
        </Stack>
        {canManage ? (
          <Button size="small" color="error" variant="outlined"
            onClick={() => setDeactivateOpen(true)}>
            Deactivate template
          </Button>
        ) : null}
      </Stack>

      {/* Info container */}
      <Box sx={{
        bgcolor: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 2, p: 2.5, mb: 3
      }}>
        {editingMeta ? (
          <Stack spacing={1.5}>
            <TextField label="Template name" value={editName}
              onChange={(e) => setEditName(e.target.value)} required fullWidth />
            <TextField label="Description" value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              multiline rows={2} fullWidth />
            <TextField label="Estimated duration (minutes)" type="number"
              value={editEstimatedMinutes}
              onChange={(e) => setEditEstimatedMinutes(e.target.value)} fullWidth />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button size="small" onClick={() => setEditingMeta(false)}>Cancel</Button>
              <Button size="small" variant="contained"
                onClick={handleSaveMeta} disabled={savingMeta || !editName.trim()}>
                {savingMeta ? "Saving..." : "Save"}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <InfoField label="TEMPLATE NAME">
                <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  {template.name}
                </Typography>
              </InfoField>
              {template.description ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {template.description}
                </Typography>
              ) : null}
              {template.estimatedMinutes ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  Estimated duration: {template.estimatedMinutes} minutes
                </Typography>
              ) : null}
            </Box>
            {canManage ? (
              <Button size="small" startIcon={<EditIcon sx={{ fontSize: 13 }} />}
                onClick={() => setEditingMeta(true)} sx={{ flexShrink: 0, ml: 2 }}>
                Edit
              </Button>
            ) : null}
          </Stack>
        )}
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 240px" },
        gap: 3, alignItems: "start"
      }}>

        {/* Left — checklist items */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography sx={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                color: "var(--color-text-tertiary)"
              }}>
                CHECKLIST ITEMS — {template.items.length}
              </Typography>
              {canManage ? (
                <Button size="small" startIcon={<AddIcon />}
                  onClick={() => setAddItemOpen(true)}>
                  Add item
                </Button>
              ) : null}
            </Stack>

            {template.items.length === 0 ? (
              <Box sx={{
                py: 3, textAlign: "center",
                border: "1px dashed var(--color-border-tertiary)",
                borderRadius: 1.5
              }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  No checklist items yet.
                </Typography>
                {canManage ? (
                  <Button size="small" variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setAddItemOpen(true)}>
                    Add first item
                  </Button>
                ) : null}
              </Box>
            ) : (
              <Stack spacing={2}>
                {Object.entries(itemsBySection).map(([sectionName, items]) => (
                  <Box key={sectionName}>
                    {sections.length > 1 || sectionName !== "General" ? (
                      <Typography sx={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                        color: "var(--color-text-tertiary)", mb: 1
                      }}>
                        {sectionName.toUpperCase()}
                      </Typography>
                    ) : null}
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: 32 }} />
                            <TableCell sx={{ width: 36 }}>#</TableCell>
                            <TableCell>Label</TableCell>
                            <TableCell>Response</TableCell>
                            <TableCell>Required</TableCell>
                            <TableCell>Critical</TableCell>
                            {canManage ? <TableCell align="right">Actions</TableCell> : null}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {items.map((item) => (
                            <TableRow key={item.id}
                              sx={{ "&:hover": { bgcolor: "#f8fafc" } }}>
                              <TableCell>
                                <DragIndicatorIcon sx={{ fontSize: 16, color: "#cbd5e1" }} />
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                  {item.sortOrder}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={500}>
                                  {item.label}
                                </Typography>
                                {item.guidance ? (
                                  <Typography variant="caption" color="text.secondary"
                                    sx={{ fontStyle: "italic" }}>
                                    {item.guidance.length > 80
                                      ? item.guidance.slice(0, 80) + "..."
                                      : item.guidance}
                                  </Typography>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <Chip size="small"
                                  label={RESPONSE_TYPE_LABELS[item.responseType] ?? item.responseType}
                                  sx={{ bgcolor: "#f1f5f9", color: "#475569", fontSize: 10 }} />
                              </TableCell>
                              <TableCell>
                                <Chip size="small"
                                  label={item.isRequired ? "Yes" : "No"}
                                  sx={item.isRequired
                                    ? { bgcolor: "#e8f1ff", color: "primary.main", fontSize: 10 }
                                    : { bgcolor: "#f1f5f9", color: "#64748b", fontSize: 10 }} />
                              </TableCell>
                              <TableCell>
                                {item.isCritical ? (
                                  <Chip size="small" label="Critical"
                                    sx={{ bgcolor: "#fef2f2", color: "#b91c1c", fontSize: 10 }} />
                                ) : (
                                  <Typography variant="caption" color="text.secondary">—</Typography>
                                )}
                              </TableCell>
                              {canManage ? (
                                <TableCell align="right">
                                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                    <Button size="small"
                                      startIcon={<EditIcon sx={{ fontSize: 13 }} />}
                                      onClick={() => setEditItem(item)}>
                                      Edit
                                    </Button>
                                    <Button size="small" color="error"
                                      startIcon={<DeleteOutlineIcon sx={{ fontSize: 13 }} />}
                                      onClick={() => setDeleteItem(item)}>
                                      Delete
                                    </Button>
                                  </Stack>
                                </TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        {/* Right — properties */}
        <Stack spacing={2}>
          <PanelCard>
            <SectionHeader label="TEMPLATE INFO" />
            <Stack spacing={0} divider={<Divider />} sx={{ mt: 1.5 }}>
              {[
                {
                  label: "Reference",
                  value: <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                    {template.reference}
                  </Typography>
                },
                {
                  label: "Check type",
                  value: <Typography variant="caption">{template.checkType}</Typography>
                },
                {
                  label: "Total items",
                  value: <Typography variant="caption" fontWeight={600}>
                    {template.items.length}
                  </Typography>
                },
                {
                  label: "Required items",
                  value: <Typography variant="caption">
                    {template.items.filter(i => i.isRequired).length}
                  </Typography>
                },
                {
                  label: "Critical items",
                  value: <Typography variant="caption" sx={{
                    color: template.items.filter(i => i.isCritical).length > 0 ? "#b91c1c" : "inherit",
                    fontWeight: template.items.filter(i => i.isCritical).length > 0 ? 700 : 400
                  }}>
                    {template.items.filter(i => i.isCritical).length}
                  </Typography>
                },
                template.estimatedMinutes ? {
                  label: "Est. duration",
                  value: <Typography variant="caption">{template.estimatedMinutes} min</Typography>
                } : null,
                {
                  label: "Created",
                  value: <Typography variant="caption">
                    {new Date(template.createdAt).toLocaleDateString("en-GB")}
                  </Typography>
                },
                {
                  label: "Last updated",
                  value: <Typography variant="caption">
                    {new Date(template.updatedAt).toLocaleDateString("en-GB")}
                  </Typography>
                }
              ].filter(Boolean).map((row: any) => (
                <Stack key={row.label} direction="row" justifyContent="space-between"
                  alignItems="center" sx={{ py: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, mr: 1 }}>
                    {row.label}
                  </Typography>
                  {row.value}
                </Stack>
              ))}
            </Stack>
          </PanelCard>

          {sections.length > 1 ? (
            <PanelCard>
              <SectionHeader label="SECTIONS" />
              <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                {Object.entries(itemsBySection).map(([sectionName, items]) => (
                  <Stack key={sectionName} direction="row" justifyContent="space-between"
                    alignItems="center">
                    <Typography variant="caption" fontWeight={500}>{sectionName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {items.length} item{items.length !== 1 ? "s" : ""}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </PanelCard>
          ) : null}
        </Stack>
      </Box>

      {/* Add item dialog */}
      <ItemFormDialog
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onSave={handleAddItem}
        nextSortOrder={nextSortOrder}
        existingSections={template.items.map(i => i.section ?? "")}
      />

      {/* Edit item dialog */}
      {editItem ? (
        <ItemFormDialog
          open={!!editItem}
          onClose={() => setEditItem(null)}
          onSave={handleEditItem}
          initial={editItem}
          nextSortOrder={nextSortOrder}
          existingSections={template.items.map(i => i.section ?? "")}
        />
      ) : null}

      {/* Delete item dialog */}
      <Dialog open={!!deleteItem} onClose={() => setDeleteItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete checklist item</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete this item?
          </Typography>
          {deleteItem ? (
            <Box sx={{
              mt: 1.5, p: 1.25, borderRadius: 1.5,
              bgcolor: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)"
            }}>
              <Typography variant="body2" fontWeight={600}>{deleteItem.label}</Typography>
            </Box>
          ) : null}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            This will not affect checks already created from this template.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteItem(null)}>Cancel</Button>
          <Button variant="contained" color="error"
            onClick={handleDeleteItem} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete item"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate dialog */}
      <Dialog open={deactivateOpen} onClose={() => setDeactivateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Deactivate template</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Deactivating this template will prevent it from being used for new checks. Existing checks created from this template are not affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error"
            onClick={handleDeactivate} disabled={deactivating}>
            {deactivating ? "Deactivating..." : "Deactivate template"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}