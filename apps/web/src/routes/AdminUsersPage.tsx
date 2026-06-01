import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Button, InputAdornment, Stack, TextField, Typography } from "@mui/material"
import PersonAddIcon from "@mui/icons-material/PersonAdd"
import SearchIcon from "@mui/icons-material/Search"
import { api } from "../lib/api"
import { listOrgUsers, type UserView } from "../lib/users"
import { isAdStaffRole } from "../lib/rbac"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import UserListRow from "../components/UserListRow"
import UserFormDrawer, { type UserFormMode } from "../components/UserFormDrawer"

type Client = { id: string; name: string }

// Top Admin → Users: Assured Digital's own staff, org-wide (not filtered by the
// global client selector). Client-own users live under Client Admin → Users.
export default function AdminUsersPage() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [mode, setMode] = React.useState<UserFormMode>("create")
  const [selected, setSelected] = React.useState<UserView | null>(null)
  const [search, setSearch] = React.useState("")

  // Org-wide fetch: listOrgUsers sends an explicit empty x-client-id so the
  // interceptor doesn't scope us to the selected client.
  const users = useQuery({ queryKey: ["users-org"], queryFn: listOrgUsers })

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await api.get<Client[]>("/clients")).data
  })

  const clientNameById = React.useMemo(
    () => new Map((clients.data ?? []).map((c) => [c.id, c.name])),
    [clients.data]
  )

  // AD-staff roles only (ORG_OWNER/ORG_ADMIN/SERVICE_MANAGER/ANALYST/ENGINEER,
  // plus legacy ADMIN). CLIENT_VIEWER and PUBLIC_USER are excluded.
  const staffUsers = React.useMemo(
    () => (users.data ?? []).filter((u) => isAdStaffRole(u.role)),
    [users.data]
  )

  // Client-side filter of the visible rows by email or role.
  const visibleUsers = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...staffUsers].sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || a.email.localeCompare(b.email)
    )
    if (!q) return sorted
    return sorted.filter(
      (u) => u.email.toLowerCase().includes(q) || u.role.replace(/_/g, " ").toLowerCase().includes(q)
    )
  }, [staffUsers, search])

  function openCreate() {
    setSelected(null)
    setMode("create")
    setDrawerOpen(true)
  }

  function openEdit(user: UserView) {
    setSelected(user)
    setMode("edit")
    setDrawerOpen(true)
  }

  return (
    <Box>
      {/* Minimal toolbar: label + create, then search */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          mb: 1.5
        }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary, #0f172a)" }}>
          Staff users
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
          onClick={openCreate}
        >
          Create user
        </Button>
      </Box>

      <TextField
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by email or role"
        size="small"
        fullWidth
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: "var(--color-text-muted, #64748b)" }} />
            </InputAdornment>
          )
        }}
      />

      {users.isError ? (
        <ErrorState title="Failed to load users" />
      ) : users.isLoading ? (
        <LoadingState label="Loading users…" />
      ) : visibleUsers.length === 0 ? (
        search.trim() ? (
          <EmptyState title="No matching users" detail="Try a different email or role." />
        ) : (
          <EmptyState title="No staff users yet" detail="Create a user to grant Assured Digital staff access." />
        )
      ) : (
        <Stack spacing={1}>
          {visibleUsers.map((u) => (
            <UserListRow key={u.id} user={u} clientNameById={clientNameById} onEdit={openEdit} />
          ))}
        </Stack>
      )}

      <UserFormDrawer open={drawerOpen} mode={mode} user={selected} onClose={() => setDrawerOpen(false)} context="org-staff" />
    </Box>
  )
}
