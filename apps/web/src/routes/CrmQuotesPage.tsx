import React from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Alert, Box, Button, Card, Drawer, Stack, Typography } from "@mui/material"
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined"
import { DataGrid, GridColDef } from "@mui/x-data-grid"
import { EmptyState, ErrorState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { FormTextField, EnumSelect, DateField } from "../components/fields"
import { QuoteLineItemsEditor } from "../components/QuoteLineItemsEditor"
import { useThemeMode } from "../lib/theme"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { type ApiError } from "../lib/api"
import {
  QUOTE_STATUS_LABELS, contactDisplayName, createQuote, formatMoney, listContacts, listOpportunities, listQuotes,
  type QuoteInput, type QuoteLineInput, type QuoteView
} from "../lib/crm"

const QuotesToolbar = makeGridToolbar("quotes")

function QuoteCreateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = React.useState<QuoteInput>({ title: "" })
  const [lines, setLines] = React.useState<QuoteLineInput[]>([])

  React.useEffect(() => {
    if (open) {
      setForm({ title: "" })
      setLines([{ description: "", quantity: 1, unitPrice: 0 }])
    }
  }, [open])

  const contacts = useQuery({
    queryKey: ["contacts", { forPicker: true }],
    queryFn: () => listContacts({ status: "ACTIVE" }),
    enabled: open
  })
  const opportunities = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => listOpportunities(),
    enabled: open
  })

  const mutation = useMutation({
    mutationFn: async () => createQuote({
      ...form,
      title: form.title.trim(),
      lineItems: lines.filter(l => l.description.trim())
    }),
    onSuccess: async created => {
      await qc.invalidateQueries({ queryKey: ["quotes"] })
      onClose()
      navigate(`/crm/quotes/${created.id}`)
    }
  })

  const err = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(err?.message) ? err.message.join(", ") : err?.message
  const set = (patch: Partial<QuoteInput>) => setForm(f => ({ ...f, ...patch }))

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 340, sm: 520 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>New quote</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
          Starts as a Draft — line items stay editable until it's sent.
        </Typography>

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <FormTextField label="Title" value={form.title} onChange={e => set({ title: e.target.value })} required />

          <EnumSelect label="Opportunity" value={form.opportunityId ?? ""}
            onChange={val => set({ opportunityId: val || undefined })} includeEmpty="— None —"
            options={(opportunities.data ?? []).map(o => ({ value: o.id, label: `${o.reference} — ${o.title}` }))} />

          <EnumSelect label="Recipient contact" value={form.contactId ?? ""}
            onChange={val => set({ contactId: val || undefined })} includeEmpty="— None —"
            options={(contacts.data ?? []).map(c => ({ value: c.id, label: contactDisplayName(c) }))} />

          <DateField label="Valid until"
            value={form.validUntil ? form.validUntil.slice(0, 10) : ""}
            onChange={val => set({ validUntil: val ? new Date(val).toISOString() : undefined })} />

          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text-muted)", mb: 1 }}>Line items</Typography>
            <QuoteLineItemsEditor lines={lines} onChange={setLines} />
          </Box>

          <FormTextField label="Description" value={form.description ?? ""}
            onChange={e => set({ description: e.target.value || undefined })}
            multiline minRows={2} />

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>Cancel</Button>
          <Button variant="contained" onClick={() => mutation.mutate()}
            disabled={form.title.trim().length < 3 || mutation.isPending} fullWidth>
            {mutation.isPending ? "Creating…" : "Create draft"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

export default function CrmQuotesPage() {
  const navigate = useNavigate()
  const { mode: themeMode } = useThemeMode()
  const canWrite = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])
  const [createOpen, setCreateOpen] = React.useState(false)

  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() })
  const rows = quotes.data ?? []
  const hasValues = rows.some(q => q.value !== undefined)

  const columns: GridColDef<QuoteView>[] = React.useMemo(() => [
    { field: "reference", headerName: "Ref", width: 140,
      renderCell: p => (
        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
          {p.value as string}{p.row.version > 1 ? ` v${p.row.version}` : ""}
        </Typography>
      ) },
    { field: "title", headerName: "Title", flex: 1, minWidth: 220,
      renderCell: p => <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.value as string}</Typography> },
    { field: "status", headerName: "Status", width: 130,
      renderCell: p => (
        <StatusPill intent={entityStatusIntent(p.value as string)}
          label={QUOTE_STATUS_LABELS[p.value as string] ?? (p.value as string).toLowerCase()} size="sm" />
      ) },
    ...(hasValues ? [{
      field: "value", headerName: "Value", width: 120,
      renderCell: (p: any) => <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{formatMoney(p.value as number, p.row.currency) ?? "—"}</Typography>
    } as GridColDef<QuoteView>] : []),
    { field: "opportunity", headerName: "Opportunity", width: 160,
      valueGetter: (_v, row) => row.opportunity?.reference ?? "",
      renderCell: p => <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{(p.value as string) || "—"}</Typography> },
    { field: "validUntil", headerName: "Valid until", width: 120,
      renderCell: p => (
        <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          {p.value ? new Date(p.value as string).toLocaleDateString("en-GB") : "—"}
        </Typography>
      ) }
  ], [hasValues])

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480 }}>
      <Card sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <Box sx={{
          borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.25, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5
        }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: themeMode === "dark" ? "#e2e8f0" : "#334155" }}>
            Quotes
          </Typography>
          {canWrite ? (
            <Button size="small" variant="contained" startIcon={<RequestQuoteOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={() => setCreateOpen(true)}>
              New Quote
            </Button>
          ) : null}
        </Box>

        {quotes.isError ? (
          <Box sx={{ p: 2 }}><ErrorState title="Failed to load quotes" /></Box>
        ) : null}

        <Box sx={{ flex: 1, minHeight: 0 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={quotes.isLoading}
            density="compact"
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
            disableRowSelectionOnClick
            onRowClick={p => navigate(`/crm/quotes/${p.id}`)}
            slots={{
              toolbar: QuotesToolbar,
              noRowsOverlay: () => (
                <Box sx={{ p: 2 }}>
                  <EmptyState title="No quotes yet"
                    detail="Draft, send and track quotes for this client — accepted quotes become work packages." />
                </Box>
              )
            }}
            sx={dataGridSx(true, themeMode)}
          />
        </Box>
      </Card>

      <QuoteCreateDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  )
}
