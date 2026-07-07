import React from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Box, Button, Card, Chip, Drawer, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography
} from "@mui/material"
import { DataGrid, GridColDef } from "@mui/x-data-grid"
import AddIcon from "@mui/icons-material/Add"
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment"
import PersonOutlineIcon from "@mui/icons-material/PersonOutline"
import EventIcon from "@mui/icons-material/Event"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { FormTextField, EnumSelect, DateField, AssigneePicker } from "../components/fields"
import { type ApiError } from "../lib/api"
import {
  OPEN_STAGES, OPPORTUNITY_STAGE_LABELS, OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS,
  contactDisplayName, createOpportunity, formatMoney, isRotting, listContacts, listOpportunities,
  type OpportunityInput, type OpportunityView
} from "../lib/crm"

const OpportunitiesToolbar = makeGridToolbar("opportunities")

// ── Create drawer ──────────────────────────────────────────────────────────
function OpportunityCreateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: assignable } = useAssignableUsers()
  const [form, setForm] = React.useState<OpportunityInput>({ title: "" })

  React.useEffect(() => {
    if (open) setForm({ title: "", type: "NEW_BUSINESS" })
  }, [open])

  const contacts = useQuery({
    queryKey: ["contacts", { forPicker: true }],
    queryFn: () => listContacts({ status: "ACTIVE" }),
    enabled: open
  })

  const mutation = useMutation({
    mutationFn: async () => createOpportunity({ ...form, title: form.title.trim() }),
    onSuccess: async created => {
      await qc.invalidateQueries({ queryKey: ["opportunities"] })
      onClose()
      navigate(`/crm/opportunities/${created.id}`)
    }
  })

  const err = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(err?.message) ? err.message.join(", ") : err?.message
  const set = (patch: Partial<OpportunityInput>) => setForm(f => ({ ...f, ...patch }))

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 340, sm: 440 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>New opportunity</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
          Starts in Discovery. Track it forward through the pipeline as the deal develops.
        </Typography>

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <FormTextField label="Title" value={form.title} onChange={e => set({ title: e.target.value })} required />

          <EnumSelect label="Type" value={form.type ?? "NEW_BUSINESS"} onChange={val => set({ type: val })}
            options={OPPORTUNITY_TYPES.map(t => ({ value: t, label: OPPORTUNITY_TYPE_LABELS[t] }))} />

          <FormTextField label="Value (£)" type="number" value={form.value ?? ""}
            onChange={e => set({ value: e.target.value === "" ? undefined : Number(e.target.value) })} />

          <DateField label="Expected close"
            value={form.expectedCloseDate ? form.expectedCloseDate.slice(0, 10) : ""}
            onChange={val => set({ expectedCloseDate: val ? new Date(val).toISOString() : undefined })} />

          <AssigneePicker label="Owner" value={form.ownerId ?? ""}
            onChange={val => set({ ownerId: val || undefined })} users={assignable} />

          <EnumSelect label="Primary contact" value={form.contactId ?? ""}
            onChange={val => set({ contactId: val || undefined })} includeEmpty="— None —"
            options={(contacts.data ?? []).map(c => ({ value: c.id, label: contactDisplayName(c) }))} />

          <Stack direction="row" spacing={1.2}>
            <Box sx={{ flex: 1 }}>
              <FormTextField label="Next step" value={form.nextStep ?? ""} onChange={e => set({ nextStep: e.target.value || undefined })} />
            </Box>
            <Box sx={{ width: 170 }}>
              <DateField label="By" value={form.nextStepDate ? form.nextStepDate.slice(0, 10) : ""}
                onChange={val => set({ nextStepDate: val ? new Date(val).toISOString() : undefined })} />
            </Box>
          </Stack>

          <FormTextField label="Notes" value={form.notes ?? ""} onChange={e => set({ notes: e.target.value || undefined })}
            multiline minRows={3} />

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>Cancel</Button>
          <Button variant="contained" onClick={() => mutation.mutate()}
            disabled={form.title.trim().length < 3 || mutation.isPending} fullWidth>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

// ── Board card ─────────────────────────────────────────────────────────────
function DealCard({ o, onOpen }: { o: OpportunityView; onOpen: () => void }) {
  const rotting = isRotting(o)
  const money = formatMoney(o.value, o.currency)
  return (
    <Box onClick={onOpen} sx={{
      p: 1.25, mb: 1, borderRadius: "8px", cursor: "pointer",
      border: "1px solid", borderColor: rotting ? "rgba(220,38,38,0.35)" : "divider",
      bgcolor: "background.paper",
      "&:hover": { borderColor: "rgba(29,78,216,0.45)", boxShadow: "0 1px 4px rgba(15,23,42,0.08)" }
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600 }}>{o.reference}</Typography>
        {o.type !== "NEW_BUSINESS" ? (
          <Chip size="small" label={o.type === "RENEWAL" ? "renewal" : "expansion"}
            sx={{ fontSize: 9.5, height: 16 }} />
        ) : null}
        {rotting ? (
          <Tooltip title="Stalled — too long in stage or next step overdue">
            <LocalFireDepartmentIcon sx={{ fontSize: 14, color: "#dc2626", ml: "auto" }} />
          </Tooltip>
        ) : null}
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 0.25, lineHeight: 1.3 }}>{o.title}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75, flexWrap: "wrap" }}>
        {money ? <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#1d4ed8" }}>{money}</Typography> : null}
        {o.owner?.displayName ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.35 }}>
            <PersonOutlineIcon sx={{ fontSize: 13, color: "var(--color-text-muted)" }} />
            <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{o.owner.displayName}</Typography>
          </Box>
        ) : null}
        {o.expectedCloseDate ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.35 }}>
            <EventIcon sx={{ fontSize: 13, color: "var(--color-text-muted)" }} />
            <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
              {new Date(o.expectedCloseDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </Typography>
          </Box>
        ) : null}
      </Box>
      {o.nextStep ? (
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", mt: 0.5, fontStyle: "italic" }} noWrap>
          → {o.nextStep}
        </Typography>
      ) : null}
    </Box>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function CrmPipelinePage() {
  const navigate = useNavigate()
  const { mode: themeMode } = useThemeMode()
  const canWrite = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const [view, setView] = React.useState<"board" | "list">("board")
  const [createOpen, setCreateOpen] = React.useState(false)

  const opportunities = useQuery({ queryKey: ["opportunities"], queryFn: () => listOpportunities() })
  const rows = opportunities.data ?? []

  const byStage = React.useMemo(() => {
    const map = new Map<string, OpportunityView[]>()
    for (const s of OPEN_STAGES) map.set(s, [])
    for (const o of rows) if (map.has(o.stage)) map.get(o.stage)!.push(o)
    return map
  }, [rows])

  // Weighted totals only when the API returned values (commercial roles).
  const hasValues = rows.some(o => o.value !== undefined && o.value !== null)

  const listColumns: GridColDef<OpportunityView>[] = React.useMemo(() => [
    { field: "reference", headerName: "Ref", width: 130,
      renderCell: p => <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{p.value as string}</Typography> },
    { field: "title", headerName: "Title", flex: 1, minWidth: 220,
      renderCell: p => <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.value as string}</Typography> },
    { field: "type", headerName: "Type", width: 130,
      renderCell: p => <Typography sx={{ fontSize: 12.5 }}>{OPPORTUNITY_TYPE_LABELS[p.value as string] ?? p.value}</Typography> },
    { field: "stage", headerName: "Stage", width: 130,
      renderCell: p => (
        <StatusPill intent={entityStatusIntent(p.value as string)} label={OPPORTUNITY_STAGE_LABELS[p.value as string] ?? (p.value as string).toLowerCase()} size="sm" />
      ) },
    ...(hasValues ? [{
      field: "value", headerName: "Value", width: 120,
      renderCell: (p: any) => <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{formatMoney(p.value as number, p.row.currency) ?? "—"}</Typography>
    } as GridColDef<OpportunityView>] : []),
    { field: "owner", headerName: "Owner", width: 160,
      valueGetter: (_v, row) => row.owner?.displayName ?? "",
      renderCell: p => <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{(p.value as string) || "—"}</Typography> },
    { field: "expectedCloseDate", headerName: "Close", width: 110,
      renderCell: p => (
        <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          {p.value ? new Date(p.value as string).toLocaleDateString("en-GB") : "—"}
        </Typography>
      ) }
  ], [hasValues])

  return (
    <Box>
      <Card>
        <Box sx={{
          borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.25,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap"
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: themeMode === "dark" ? "#e2e8f0" : "#334155" }}>
              Pipeline
            </Typography>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v) => v && setView(v)}
              sx={{ "& .MuiToggleButton-root": { px: 1.25, py: 0.25, fontSize: 11.5, textTransform: "none" } }}>
              <ToggleButton value="board">Board</ToggleButton>
              <ToggleButton value="list">List</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {canWrite ? (
            <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={() => setCreateOpen(true)}>
              New Opportunity
            </Button>
          ) : null}
        </Box>

        {opportunities.isError ? (
          <Box sx={{ p: 2 }}><ErrorState title="Failed to load pipeline" /></Box>
        ) : opportunities.isLoading ? (
          <Box sx={{ p: 2 }}><LoadingState /></Box>
        ) : view === "board" ? (
          rows.filter(o => (OPEN_STAGES as readonly string[]).includes(o.stage)).length === 0 ? (
            <Box sx={{ p: 2 }}>
              <EmptyState title="No open opportunities"
                detail="New deals and renewals for this client appear here as they move through the pipeline." />
            </Box>
          ) : (
            <Box sx={{ display: "flex", gap: 1.5, p: 2, overflowX: "auto", alignItems: "flex-start" }}>
              {OPEN_STAGES.map(stage => {
                const deals = byStage.get(stage) ?? []
                const total = deals.reduce((s, o) => s + (o.value ?? 0), 0)
                const weighted = deals.reduce((s, o) => s + (o.value ?? 0) * ((o.probability ?? 0) / 100), 0)
                return (
                  <Box key={stage} sx={{ minWidth: 250, flex: "1 0 250px", bgcolor: themeMode === "dark" ? "rgba(255,255,255,0.03)" : "#f8fafc", borderRadius: "10px", p: 1.25 }}>
                    <Box sx={{ px: 0.5, pb: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                          {OPPORTUNITY_STAGE_LABELS[stage]}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{deals.length}</Typography>
                      </Box>
                      {hasValues ? (
                        <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                          {formatMoney(total) ?? "£0"} · weighted {formatMoney(Math.round(weighted)) ?? "£0"}
                        </Typography>
                      ) : null}
                    </Box>
                    {deals.map(o => (
                      <DealCard key={o.id} o={o} onOpen={() => navigate(`/crm/opportunities/${o.id}`)} />
                    ))}
                  </Box>
                )
              })}
            </Box>
          )
        ) : (
          <Box sx={{ height: 620 }}>
            <DataGrid
              rows={rows}
              columns={listColumns}
              density="compact"
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              pageSizeOptions={[25, 50, 100]}
              disableRowSelectionOnClick
              onRowClick={p => navigate(`/crm/opportunities/${p.id}`)}
              slots={{ toolbar: OpportunitiesToolbar }}
              sx={dataGridSx(true, themeMode)}
            />
          </Box>
        )}
      </Card>

      <OpportunityCreateDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  )
}
