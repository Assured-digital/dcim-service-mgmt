import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Button, Card, MenuItem, Stack, TextField, Typography } from "@mui/material"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import AddIcon from "@mui/icons-material/Add"
import { listKnowledge, type KnowledgeArticle, type KnowledgeStatus } from "../lib/knowledge"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useThemeMode } from "../lib/theme"
import KnowledgeDrawer from "../components/KnowledgeDrawer"

const AUTHOR_ROLES = [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST]

const STATUS_TINT: Record<KnowledgeStatus, { bg: string; fg: string; label: string }> = {
  PUBLISHED: { bg: "rgba(34,197,94,0.15)", fg: "#4ade80", label: "Published" },
  DRAFT: { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8", label: "Draft" },
  ARCHIVED: { bg: "rgba(100,116,139,0.12)", fg: "#64748b", label: "Archived" }
}

export default function KnowledgePage() {
  const { mode: themeMode } = useThemeMode()
  const canEdit = hasAnyRole(AUTHOR_ROLES)

  const [q, setQ] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<"all" | KnowledgeStatus>("all")
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<KnowledgeArticle | null>(null)

  const articles = useQuery({ queryKey: ["knowledge"], queryFn: () => listKnowledge() })

  const shown = React.useMemo(() => {
    const term = q.trim().toLowerCase()
    return (articles.data ?? []).filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false
      if (!term) return true
      return (
        a.title.toLowerCase().includes(term) ||
        a.category.toLowerCase().includes(term) ||
        a.body.toLowerCase().includes(term)
      )
    })
  }, [articles.data, q, statusFilter])

  function openNew() { setSelected(null); setDrawerOpen(true) }
  function openArticle(a: KnowledgeArticle) { setSelected(a); setDrawerOpen(true) }

  return (
    <Box>
      <Card>
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: themeMode === "dark" ? "#e2e8f0" : "#334155", display: "flex", alignItems: "center", gap: 0.75 }}>
            <MenuBookIcon sx={{ fontSize: 18 }} /> Knowledge base
          </Typography>
          <Box sx={{ flex: 1 }} />
          <TextField size="small" placeholder="Search articles…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 220 }} />
          <TextField size="small" select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} sx={{ minWidth: 140 }}>
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="PUBLISHED">Published</MenuItem>
            <MenuItem value="DRAFT">Draft</MenuItem>
            <MenuItem value="ARCHIVED">Archived</MenuItem>
          </TextField>
          {canEdit ? (
            <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={openNew}>
              New Article
            </Button>
          ) : null}
        </Box>

        {articles.isLoading ? (
          <Box sx={{ p: 3 }}><LoadingState /></Box>
        ) : articles.isError ? (
          <Box sx={{ p: 2 }}><ErrorState title="Failed to load articles" /></Box>
        ) : shown.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState title="No articles" detail={canEdit ? "Create your first knowledge base article." : "No knowledge base articles yet."} />
          </Box>
        ) : (
          <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
            {shown.map((a) => {
              const tint = STATUS_TINT[a.status]
              return (
                <Box key={a.id} onClick={() => openArticle(a)} sx={{ px: 2, py: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</Typography>
                    <Box sx={{ px: 0.9, py: 0.15, borderRadius: 1, bgcolor: tint.bg }}>
                      <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: tint.fg, letterSpacing: 0.3 }}>{tint.label}</Typography>
                    </Box>
                    <Box sx={{ px: 0.9, py: 0.15, borderRadius: 1, bgcolor: a.shared ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.12)" }}>
                      <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: a.shared ? "#7db4f5" : "#94a3b8" }}>{a.shared ? "Shared" : "This client"}</Typography>
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)", mt: 0.4 }}>
                    {a.reference} · {a.category} · updated {new Date(a.updatedAt).toLocaleDateString("en-GB")}
                  </Typography>
                </Box>
              )
            })}
          </Stack>
        )}
      </Card>

      <KnowledgeDrawer open={drawerOpen} article={selected} canEdit={canEdit} onClose={() => setDrawerOpen(false)} />
    </Box>
  )
}
