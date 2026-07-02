import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Box, Button, Stack, Typography } from "@mui/material"
import { api } from "../lib/api"
import { StatusPill } from "../components/shared"
import { CreateTaskModal } from "./modals/CreateTaskModal"
import { CreateRiskModal, CreateIssueModal } from "./RisksIssuesPage"
import { CreateServiceRequestModal } from "./ServiceDeskPage"
import { LinkedIssue, LinkedRisk, LinkedServiceRequest, LinkedTask } from "../lib/infrastructure"

// Linked-records parity for Site (DCIM_DESIGN_BRIEF §6 — exists on Asset + Cabinet).
// Uses the LIVE generic linkedEntityType/Id pointer ("Site" is an intended additive
// parent type per CLAUDE.md); the list endpoints filter on it and the create modals
// stamp it — no schema or backend change.
export default function SiteLinkedRecords({ siteId, siteName, canManage }: {
  siteId: string; siteName: string; canManage: boolean
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [createModal, setCreateModal] = React.useState<"task" | "risk" | "issue" | "serviceRequest" | null>(null)

  const params = { linkedEntityType: "Site", linkedEntityId: siteId }
  const tasks = useQuery({ queryKey: ["linked-tasks-site", siteId], queryFn: async () => (await api.get<LinkedTask[]>("/tasks", { params })).data })
  const srs = useQuery({ queryKey: ["linked-srs-site", siteId], queryFn: async () => (await api.get<LinkedServiceRequest[]>("/service-requests", { params })).data })
  const risks = useQuery({ queryKey: ["linked-risks-site", siteId], queryFn: async () => (await api.get<LinkedRisk[]>("/risks", { params })).data })
  const issues = useQuery({ queryKey: ["linked-issues-site", siteId], queryFn: async () => (await api.get<LinkedIssue[]>("/issues", { params })).data })

  const sections = [
    { title: "Service requests", items: srs.data ?? [], onClick: (id: string) => navigate(`/service-requests/${id}`), subtitle: (i: any) => i.subject },
    { title: "Risks", items: risks.data ?? [], onClick: (id: string) => navigate(`/risks/${id}`), subtitle: (i: any) => `${i.likelihood} / ${i.impact}` },
    { title: "Issues", items: issues.data ?? [], onClick: (id: string) => navigate(`/issues/${id}`), subtitle: (i: any) => i.severity },
    { title: "Tasks", items: tasks.data ?? [], onClick: (id: string) => navigate(`/service-desk/task/${id}`), subtitle: (i: any) => i.title },
  ]

  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ px: "20px", py: "14px", borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "text.secondary", flex: 1 }}>Linked records</Typography>
        {canManage ? (
          <Stack direction="row" spacing={0.5}>
            <Button size="small" onClick={() => setCreateModal("task")} sx={{ textTransform: "none", fontSize: 11.5 }}>+ Task</Button>
            <Button size="small" onClick={() => setCreateModal("serviceRequest")} sx={{ textTransform: "none", fontSize: 11.5 }}>+ SR</Button>
            <Button size="small" onClick={() => setCreateModal("risk")} sx={{ textTransform: "none", fontSize: 11.5 }}>+ Risk</Button>
            <Button size="small" onClick={() => setCreateModal("issue")} sx={{ textTransform: "none", fontSize: 11.5 }}>+ Issue</Button>
          </Stack>
        ) : null}
      </Box>
      <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, p: "12px" }}>
        {sections.map(section => (
          <Box key={section.title} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
            <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.default" }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>{section.title} ({section.items.length})</Typography>
            </Box>
            {section.items.length === 0 ? (
              <Box sx={{ p: 1.5 }}><Typography sx={{ fontSize: 12, color: "text.secondary" }}>None linked</Typography></Box>
            ) : section.items.map((item: any, idx: number) => (
              <Stack key={item.id} direction="row" alignItems="center" onClick={() => section.onClick(item.id)} sx={{ p: 1.25, cursor: "pointer", borderBottom: idx < section.items.length - 1 ? "1px solid" : "none", borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{item.reference}</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.subtitle(item)}</Typography>
                </Box>
                <StatusPill value={item.status} label={String(item.status).toLowerCase().replaceAll("_", " ")} size="sm" />
              </Stack>
            ))}
          </Box>
        ))}
      </Box>

      <CreateTaskModal navigateAfterCreate={false} open={createModal === "task"} onClose={() => setCreateModal(null)}
        linkedEntityType="Site" linkedEntityId={siteId} linkedEntityLabel={siteName}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-tasks-site", siteId] }) }} />
      <CreateRiskModal open={createModal === "risk"} onClose={() => setCreateModal(null)}
        linkedEntityType="Site" linkedEntityId={siteId} linkedEntityLabel={siteName}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-risks-site", siteId] }) }} />
      <CreateIssueModal open={createModal === "issue"} onClose={() => setCreateModal(null)}
        linkedEntityType="Site" linkedEntityId={siteId} linkedEntityLabel={siteName}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-issues-site", siteId] }) }} />
      <CreateServiceRequestModal navigateAfterCreate={false} open={createModal === "serviceRequest"} onClose={() => setCreateModal(null)}
        linkedEntityType="Site" linkedEntityId={siteId} linkedEntityLabel={siteName}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-srs-site", siteId] }) }} />
    </Box>
  )
}
