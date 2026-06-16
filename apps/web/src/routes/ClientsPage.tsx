import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Button, Card, Typography } from "@mui/material"
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid"
import AddBusinessIcon from "@mui/icons-material/AddBusiness"
import EditIcon from "@mui/icons-material/Edit"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { listClients, type ClientView } from "../lib/clients"
import { EmptyState, ErrorState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import ClientFormDrawer, { type ClientFormMode } from "../components/ClientFormDrawer"

const ClientsToolbar = makeGridToolbar("clients")

function ClientsNoRowsOverlay() {
  return (
    <Box sx={{ p: 2 }}>
      <EmptyState
        title="No clients yet"
        detail="Create your first client tenant to start onboarding users and data."
      />
    </Box>
  )
}

export default function ClientsPage() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [mode, setMode] = React.useState<ClientFormMode>("create")
  const [selected, setSelected] = React.useState<ClientView | null>(null)

  const clients = useQuery({ queryKey: ["clients-admin"], queryFn: listClients })

  function openCreate() {
    setSelected(null)
    setMode("create")
    setDrawerOpen(true)
  }

  function openEdit(client: ClientView) {
    setSelected(client)
    setMode("edit")
    setDrawerOpen(true)
  }

  const columns: GridColDef<ClientView>[] = React.useMemo(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 220,
        renderCell: (p: GridRenderCellParams<ClientView>) => (
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.value as string}</Typography>
        )
      },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        renderCell: (p) => (
          <StatusPill
            intent={entityStatusIntent(p.value as string)}
            label={(p.value as string).toLowerCase()}
            size="sm"
          />
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
    []
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
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>Client management</Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddBusinessIcon sx={{ fontSize: 16 }} />}
            onClick={openCreate}
          >
            Create Client
          </Button>
        </Box>

        {clients.isError ? (
          <Box sx={{ p: 2 }}>
            <ErrorState title="Failed to load clients" />
          </Box>
        ) : null}

        <Box sx={{ height: 620 }}>
          <DataGrid
            rows={clients.data ?? []}
            columns={columns}
            loading={clients.isLoading}
            density="compact"
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: "status", sort: "asc" }, { field: "name", sort: "asc" }] }
            }}
            pageSizeOptions={[25, 50, 100]}
            disableRowSelectionOnClick
            slots={{ toolbar: ClientsToolbar, noRowsOverlay: ClientsNoRowsOverlay }}
            sx={dataGridSx(false)}
          />
        </Box>
      </Card>

      <ClientFormDrawer open={drawerOpen} mode={mode} client={selected} onClose={() => setDrawerOpen(false)} />
    </Box>
  )
}
