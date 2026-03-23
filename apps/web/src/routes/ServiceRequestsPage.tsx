import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Card, CardContent, Chip, Table, TableBody, TableCell,
  TableHead, TableRow, TableContainer, Button, Typography,
  Stack, Tab, Tabs, Badge
} from "@mui/material"
import { priorityChipSx, statusChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

type SR = {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  updatedAt: string
  assignee: { id: string; email: string } | null
}

const STATUSES = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CUSTOMER", label: "Waiting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
]

export default function ServiceRequestsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = React.useState("ALL")

  const { data, isLoading, error } = useQuery({
    queryKey: ["service-requests"],
    queryFn: async () => (await api.get<SR[]>("/service-requests")).data
  })

  const allData = data ?? []

  const filtered = activeTab === "ALL"
    ? allData
    : allData.filter((sr) => sr.status === activeTab)

  function countFor(status: string) {
    if (status === "ALL") return allData.length
    return allData.filter((sr) => sr.status === status).length
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Service Requests</Typography>

      <Card>
        <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 44 }}
          >
            {STATUSES.map((s) => {
              const count = countFor(s.value)
              return (
                <Tab
                  key={s.value}
                  value={s.value}
                  sx={{ minHeight: 44, fontSize: 13 }}
                  label={
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{s.label}</span>
                      {count > 0 ? (
                        <Box
                          sx={{
                            bgcolor: activeTab === s.value ? "#1d4ed8" : "#e2e8f0",
                            color: activeTab === s.value ? "#fff" : "#475569",
                            borderRadius: 10,
                            px: 0.75,
                            py: 0.1,
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.6
                          }}
                        >
                          {count}
                        </Box>
                      ) : null}
                    </Stack>
                  }
                />
              )
            })}
          </Tabs>
        </Box>

        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load service requests" /> : null}
          {!isLoading && !error && filtered.length === 0 ? (
            <EmptyState
              title={activeTab === "ALL" ? "No service requests yet" : `No ${activeTab.toLowerCase().replaceAll("_", " ")} requests`}
              detail={activeTab === "ALL" ? "New tickets will appear here when submitted or converted from triage." : "Try selecting a different status tab."}
            />
          ) : null}

          {filtered.length > 0 ? (
            <TableContainer>
              <Table sx={{ minWidth: 700 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Ticket</TableCell>
                    <TableCell>Subject</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((sr) => (
                    <TableRow
                      key={sr.id}
                      hover
                      onClick={() => navigate(`/service-requests/${sr.id}`)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>
                        {sr.reference}
                      </TableCell>
                      <TableCell>{sr.subject}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          sx={statusChipSx(sr.status)}
                          label={sr.status.toLowerCase().replaceAll("_", " ")}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={sr.assignee ? "text.primary" : "text.secondary"}>
                          {sr.assignee?.email ?? "Unassigned"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {new Date(sr.updatedAt).toLocaleDateString("en-GB")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
        </CardContent>
      </Card>
    </Box>
  )
}