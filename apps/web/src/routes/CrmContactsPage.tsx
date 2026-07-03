import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Box, Button, Card, Chip, Drawer, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography
} from "@mui/material"
import { DataGrid, GridColDef } from "@mui/x-data-grid"
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1"
import EditIcon from "@mui/icons-material/Edit"
import StarIcon from "@mui/icons-material/Star"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { EmptyState, ErrorState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import { useThemeMode } from "../lib/theme"
import { type ApiError, api } from "../lib/api"
import {
  CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, contactDisplayName,
  createContact, listContacts, updateContact, type ContactInput, type ContactView
} from "../lib/crm"

const ContactsToolbar = makeGridToolbar("contacts")

// ── Create/edit drawer (single-use — lives with the page, mirrors ClientFormDrawer) ──
type DrawerState = { open: boolean; contact: ContactView | null }

function ContactFormDrawer({ state, onClose }: { state: DrawerState; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!state.contact
  const c = state.contact

  const [form, setForm] = React.useState<ContactInput>({ firstName: "", lastName: "" })

  // Reset whenever the drawer opens or the target contact changes.
  React.useEffect(() => {
    if (!state.open) return
    setForm(c ? {
      firstName: c.firstName,
      lastName: c.lastName,
      jobTitle: c.jobTitle ?? undefined,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      mobile: c.mobile ?? undefined,
      siteId: c.siteId ?? undefined,
      category: c.category,
      isPrimary: c.isPrimary,
      notes: c.notes ?? undefined,
      status: c.status
    } : { firstName: "", lastName: "", category: "GENERAL" })
  }, [state.open, c])

  const sites = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>("/sites")).data,
    enabled: state.open
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const dto: ContactInput = {
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email?.trim() || undefined
      }
      return isEdit && c ? updateContact(c.id, dto) : createContact(dto)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contacts"] })
      onClose()
    }
  })

  const err = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(err?.message) ? err.message.join(", ") : err?.message

  const set = (patch: Partial<ContactInput>) => setForm(f => ({ ...f, ...patch }))
  const canSubmit = form.firstName.trim().length > 0 && form.lastName.trim().length > 0 && !mutation.isPending

  return (
    <Drawer anchor="right" open={state.open} onClose={onClose}>
      <Box sx={{ width: { xs: 340, sm: 420 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {isEdit ? "Edit contact" : "Add contact"}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
          {isEdit ? "Update this person's details." : "Record a person at this client."}
        </Typography>

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <Stack direction="row" spacing={1.2}>
            <TextField label="First name" value={form.firstName} onChange={e => set({ firstName: e.target.value })}
              required fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="Last name" value={form.lastName} onChange={e => set({ lastName: e.target.value })}
              required fullWidth InputLabelProps={{ shrink: true }} />
          </Stack>

          <TextField label="Job title" value={form.jobTitle ?? ""} onChange={e => set({ jobTitle: e.target.value || undefined })}
            fullWidth InputLabelProps={{ shrink: true }} />

          <TextField select label="Category" value={form.category ?? "GENERAL"} onChange={e => set({ category: e.target.value })}
            fullWidth InputLabelProps={{ shrink: true }}>
            {CONTACT_CATEGORIES.map(cat => (
              <MenuItem key={cat} value={cat}>{CONTACT_CATEGORY_LABELS[cat]}</MenuItem>
            ))}
          </TextField>

          <TextField label="Email" type="email" value={form.email ?? ""} onChange={e => set({ email: e.target.value || undefined })}
            fullWidth InputLabelProps={{ shrink: true }} />

          <Stack direction="row" spacing={1.2}>
            <TextField label="Phone" value={form.phone ?? ""} onChange={e => set({ phone: e.target.value || undefined })}
              fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="Mobile" value={form.mobile ?? ""} onChange={e => set({ mobile: e.target.value || undefined })}
              fullWidth InputLabelProps={{ shrink: true }} />
          </Stack>

          <TextField select label="Based at site" value={form.siteId ?? ""} onChange={e => set({ siteId: e.target.value || undefined })}
            fullWidth InputLabelProps={{ shrink: true }}>
            <MenuItem value="">— None —</MenuItem>
            {(sites.data ?? []).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>

          <TextField label="Notes" value={form.notes ?? ""} onChange={e => set({ notes: e.target.value || undefined })}
            fullWidth multiline minRows={2} InputLabelProps={{ shrink: true }} />

          <FormControlLabel
            control={<Switch checked={form.isPrimary ?? false} onChange={e => set({ isPrimary: e.target.checked })} />}
            label={<Typography sx={{ fontSize: 13.5 }}>Primary contact for this client</Typography>}
          />

          {isEdit ? (
            <TextField select label="Status" value={form.status ?? "ACTIVE"} onChange={e => set({ status: e.target.value })}
              fullWidth InputLabelProps={{ shrink: true }}>
              <MenuItem value="ACTIVE">ACTIVE</MenuItem>
              <MenuItem value="INACTIVE">INACTIVE</MenuItem>
            </TextField>
          ) : null}

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>Cancel</Button>
          <Button variant="contained" onClick={() => mutation.mutate()} disabled={!canSubmit} fullWidth>
            {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Add contact"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function CrmContactsPage() {
  const { mode: themeMode } = useThemeMode()
  const [drawer, setDrawer] = React.useState<DrawerState>({ open: false, contact: null })
  const [categoryFilter, setCategoryFilter] = React.useState<string | null>(null)
  const [showInactive, setShowInactive] = React.useState(false)

  const contacts = useQuery({
    queryKey: ["contacts", { showInactive }],
    queryFn: () => listContacts(showInactive ? {} : { status: "ACTIVE" })
  })

  const rows = React.useMemo(
    () => (contacts.data ?? []).filter(c => !categoryFilter || c.category === categoryFilter),
    [contacts.data, categoryFilter]
  )

  const columns: GridColDef<ContactView>[] = React.useMemo(() => [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 200,
      valueGetter: (_v, row) => contactDisplayName(row),
      renderCell: p => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          {p.row.isPrimary ? <StarIcon sx={{ fontSize: 15, color: "#eab308" }} titleAccess="Primary contact" /> : null}
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.value as string}</Typography>
        </Box>
      )
    },
    {
      field: "jobTitle",
      headerName: "Job title",
      width: 180,
      renderCell: p => <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{(p.value as string) || "—"}</Typography>
    },
    {
      field: "category",
      headerName: "Category",
      width: 150,
      renderCell: p => (
        <Chip size="small" label={CONTACT_CATEGORY_LABELS[p.value as string] ?? p.value}
          sx={{ fontSize: 11.5, height: 22, bgcolor: "rgba(29,78,216,0.08)", color: "#1d4ed8" }} />
      )
    },
    {
      field: "email",
      headerName: "Email",
      flex: 1,
      minWidth: 200,
      renderCell: p => <Typography sx={{ fontSize: 12.5 }}>{(p.value as string) || "—"}</Typography>
    },
    {
      field: "phone",
      headerName: "Phone",
      width: 140,
      valueGetter: (_v, row) => row.phone || row.mobile || "",
      renderCell: p => <Typography sx={{ fontSize: 12.5 }}>{(p.value as string) || "—"}</Typography>
    },
    {
      field: "site",
      headerName: "Site",
      width: 150,
      valueGetter: (_v, row) => row.site?.name ?? "",
      renderCell: p => <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{(p.value as string) || "—"}</Typography>
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      renderCell: p => (
        <StatusPill intent={entityStatusIntent(p.value as string)} label={(p.value as string).toLowerCase()} size="sm" />
      )
    },
    {
      field: "actions",
      headerName: "",
      width: 90,
      sortable: false,
      filterable: false,
      disableExport: true,
      renderCell: p => (
        <Button size="small" variant="outlined" startIcon={<EditIcon sx={{ fontSize: 15 }} />}
          onClick={() => setDrawer({ open: true, contact: p.row })}>
          Edit
        </Button>
      )
    }
  ], [])

  return (
    <Box>
      <Card>
        <Box sx={{
          borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.25,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap"
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: themeMode === "dark" ? "#e2e8f0" : "#334155", mr: 1 }}>
              Contacts
            </Typography>
            {CONTACT_CATEGORIES.map(cat => {
              const active = categoryFilter === cat
              return (
                <Chip
                  key={cat}
                  size="small"
                  label={CONTACT_CATEGORY_LABELS[cat]}
                  onClick={() => setCategoryFilter(active ? null : cat)}
                  sx={{
                    fontSize: 11.5, height: 24, cursor: "pointer",
                    bgcolor: active ? "rgba(29,78,216,0.14)" : "transparent",
                    color: active ? "#1d4ed8" : "var(--color-text-muted)",
                    border: "1px solid", borderColor: active ? "rgba(29,78,216,0.35)" : "divider"
                  }}
                />
              )
            })}
            <Chip
              size="small"
              label={showInactive ? "Hiding nothing" : "Hiding inactive"}
              onClick={() => setShowInactive(v => !v)}
              sx={{ fontSize: 11.5, height: 24, cursor: "pointer", color: "var(--color-text-muted)", border: "1px solid", borderColor: "divider", bgcolor: "transparent" }}
            />
          </Box>
          <Button size="small" variant="contained" startIcon={<PersonAddAlt1Icon sx={{ fontSize: 16 }} />}
            onClick={() => setDrawer({ open: true, contact: null })}>
            Add Contact
          </Button>
        </Box>

        {contacts.isError ? (
          <Box sx={{ p: 2 }}><ErrorState title="Failed to load contacts" /></Box>
        ) : null}

        <Box sx={{ height: 620 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={contacts.isLoading}
            density="compact"
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
            disableRowSelectionOnClick
            slots={{
              toolbar: ContactsToolbar,
              noRowsOverlay: () => (
                <Box sx={{ p: 2 }}>
                  <EmptyState
                    title="No contacts yet"
                    detail="Record the people at this client — decision makers, technical contacts, billing and site access."
                  />
                </Box>
              )
            }}
            sx={dataGridSx(false, themeMode)}
          />
        </Box>
      </Card>

      <ContactFormDrawer state={drawer} onClose={() => setDrawer({ open: false, contact: null })} />
    </Box>
  )
}
