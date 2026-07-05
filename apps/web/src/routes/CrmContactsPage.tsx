import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Box, Button, Card, Chip, Drawer, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography
} from "@mui/material"
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1"
import SearchIcon from "@mui/icons-material/Search"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import ContactListRow from "../components/ContactListRow"
import { type ApiError, api } from "../lib/api"
import {
  CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, contactDisplayName,
  createContact, listContacts, updateContact, type ContactInput, type ContactView
} from "../lib/crm"

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
  const [drawer, setDrawer] = React.useState<DrawerState>({ open: false, contact: null })
  const [categoryFilter, setCategoryFilter] = React.useState<string | null>(null)
  const [showInactive, setShowInactive] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const contacts = useQuery({
    queryKey: ["contacts", { showInactive }],
    queryFn: () => listContacts(showInactive ? {} : { status: "ACTIVE" })
  })

  // Client-side: category filter + name/email/job search. Primary contact first.
  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return (contacts.data ?? [])
      .filter(c => !categoryFilter || c.category === categoryFilter)
      .filter(c => {
        if (!q) return true
        return contactDisplayName(c).toLowerCase().includes(q)
          || (c.email ?? "").toLowerCase().includes(q)
          || (c.jobTitle ?? "").toLowerCase().includes(q)
      })
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || contactDisplayName(a).localeCompare(contactDisplayName(b)))
  }, [contacts.data, categoryFilter, search])

  return (
    <Box>
      {/* Toolbar — title + Add (Admin → Users pattern) */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, mb: 1.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary, #0f172a)" }}>Contacts</Typography>
        <Button size="small" variant="contained" startIcon={<PersonAddAlt1Icon sx={{ fontSize: 16 }} />}
          onClick={() => setDrawer({ open: true, contact: null })}>
          Add contact
        </Button>
      </Box>

      <TextField
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, email or job title"
        size="small"
        fullWidth
        sx={{ mb: 1.5 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "var(--color-text-muted, #64748b)" }} /></InputAdornment> }}
      />

      {/* Category + status filter chips */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 2, flexWrap: "wrap" }}>
        {CONTACT_CATEGORIES.map(cat => {
          const active = categoryFilter === cat
          return (
            <Chip key={cat} size="small" label={CONTACT_CATEGORY_LABELS[cat]}
              onClick={() => setCategoryFilter(active ? null : cat)}
              sx={{
                fontSize: 11.5, height: 24, cursor: "pointer",
                bgcolor: active ? "rgba(29,78,216,0.14)" : "transparent",
                color: active ? "#1d4ed8" : "var(--color-text-muted)",
                border: "1px solid", borderColor: active ? "rgba(29,78,216,0.35)" : "divider"
              }} />
          )
        })}
        <Chip size="small" label={showInactive ? "Showing inactive" : "Hiding inactive"}
          onClick={() => setShowInactive(v => !v)}
          sx={{ fontSize: 11.5, height: 24, cursor: "pointer", color: "var(--color-text-muted)", border: "1px solid", borderColor: "divider", bgcolor: "transparent" }} />
      </Box>

      {contacts.isError ? (
        <ErrorState title="Failed to load contacts" />
      ) : contacts.isLoading ? (
        <LoadingState label="Loading contacts…" />
      ) : rows.length === 0 ? (
        search.trim() || categoryFilter ? (
          <EmptyState title="No matching contacts" detail="Try a different search or clear the filters." />
        ) : (
          <EmptyState title="No contacts yet" detail="Record the people at this client — decision makers, technical contacts, billing and site access." />
        )
      ) : (
        <Stack spacing={1}>
          {rows.map(c => (
            <ContactListRow key={c.id} contact={c} onEdit={contact => setDrawer({ open: true, contact })} />
          ))}
        </Stack>
      )}

      <ContactFormDrawer state={drawer} onClose={() => setDrawer({ open: false, contact: null })} />
    </Box>
  )
}
