import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Button, Card, Chip, Typography } from "@mui/material"
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid"
import PersonAddIcon from "@mui/icons-material/PersonAdd"
import EditIcon from "@mui/icons-material/Edit"
import { api } from "../lib/api"
import { listUsers, type UserView } from "../lib/users"
import { EmptyState, ErrorState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import UserFormDrawer, { type UserFormMode } from "../components/UserFormDrawer"

type Client = { id: string; name: string }

const UsersToolbar = makeGridToolbar("users")

function UsersNoRowsOverlay() {
  return (
    <Box sx={{ p: 2 }}>
      <EmptyState title="No users yet" detail="Create a user to grant operational access for this client scope." />
    </Box>
  )
}

export default function UsersPage() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [mode, setMode] = React.useState<UserFormMode>("create")
  const [selected, setSelected] = React.useState<UserView | null>(null)

  // x-client-id is auto-attached by the api.ts interceptor for org-super users
  // based on the global client selector — no manual scoping here.
  const users = useQuery({ queryKey: ["users-admin"], queryFn: listUsers })

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await api.get<Client[]>("/clients")).data
  })

  const clientNameById = React.useMemo(
    () => new Map((clients.data ?? []).map((c) => [c.id, c.name])),
    [clients.data]
  )

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

  const columns: GridColDef<UserView>[] = React.useMemo(
    () => [
      {
        field: "email",
        headerName: "Email",
        flex: 1,
        minWidth: 220,
        renderCell: (p: GridRenderCellParams<UserView>) => (
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.value as string}</Typography>
        )
      },
      {
        field: "role",
        headerName: "Role",
        width: 190,
        renderCell: (p) => (
          <Chip
            size="small"
            label={(p.value as string).replace(/_/g, " ").toLowerCase()}
            sx={{ bgcolor: "#eef2ff", color: "#3730a3", fontWeight: 600, textTransform: "capitalize" }}
          />
        )
      },
      {
        field: "clientId",
        headerName: "Client",
        width: 180,
        valueGetter: (v) => (v ? clientNameById.get(v as string) ?? (v as string) : "Organization"),
        renderCell: (p) => (
          <Typography sx={{ fontSize: 12.5, color: p.row.clientId ? "#0f172a" : "#64748b" }}>
            {p.value as string}
          </Typography>
        )
      },
      {
        field: "isActive",
        headerName: "Status",
        width: 120,
        renderCell: (p) =>
          (p.value as boolean) ? (
            <Chip size="small" label="active" sx={{ bgcolor: "#dcfce7", color: "#166534", fontWeight: 600 }} />
          ) : (
            <Chip size="small" label="inactive" sx={{ bgcolor: "#f1f5f9", color: "#64748b", fontWeight: 600 }} />
          )
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 130,
        valueGetter: (v) => (v ? new Date(v as string) : null),
        renderCell: (p) => (
          <Typography sx={{ fontSize: 12.5, color: "#64748b" }}>
            {p.value ? (p.value as Date).toLocaleDateString("en-GB") : "—"}
          </Typography>
        )
      },
      {
        field: "actions",
        headerName: "",
        width: 90,
        sortable: false,
        filterable: false,
        disableExport: true,
        renderCell: (p) => (
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 15 }} />}
            onClick={() => openEdit(p.row)}
          >
            Edit
          </Button>
        )
      }
    ],
    [clientNameById]
  )

  return (
    <Box>
      <Card>
        <Box
          sx={{
            borderBottom: "1px solid #e2e8f0",
            px: 2,
            py: 1.25,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>User management</Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
            onClick={openCreate}
          >
            Create user
          </Button>
        </Box>

        {users.isError ? (
          <Box sx={{ p: 2 }}>
            <ErrorState title="Failed to load users" />
          </Box>
        ) : null}

        <Box sx={{ height: 620 }}>
          <DataGrid
            rows={users.data ?? []}
            columns={columns}
            loading={users.isLoading}
            density="compact"
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: "isActive", sort: "desc" }, { field: "email", sort: "asc" }] }
            }}
            pageSizeOptions={[25, 50, 100]}
            disableRowSelectionOnClick
            slots={{ toolbar: UsersToolbar, noRowsOverlay: UsersNoRowsOverlay }}
            sx={dataGridSx(false)}
          />
        </Box>
      </Card>

      <UserFormDrawer open={drawerOpen} mode={mode} user={selected} onClose={() => setDrawerOpen(false)} />
    </Box>
  )
}
