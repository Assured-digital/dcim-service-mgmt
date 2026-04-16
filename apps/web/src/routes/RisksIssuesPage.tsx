import React from "react"
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Box, Stack, Typography } from "@mui/material"

type EntityType = "risks" | "issues"
type ViewKey = "all" | "assigned" | "urgent" | "review_due"

const VIEW_ITEMS: Array<{ key: ViewKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned to me" },
  { key: "urgent", label: "Urgent" },
  { key: "review_due", label: "Review due" }
]

function isEntity(pathname: string): EntityType | null {
  if (pathname.startsWith("/risks-issues/risks")) return "risks"
  if (pathname.startsWith("/risks-issues/issues")) return "issues"
  return null
}

export default function RisksIssuesPage() {
  const navigate = useNavigate()
  const loc = useLocation()
  const entity = isEntity(loc.pathname)

  if (!entity) return <Navigate to="/risks-issues/risks?view=all" replace />

  const search = new URLSearchParams(loc.search)
  const currentView = (search.get("view") ?? "all") as ViewKey

  function selectEntity(nextEntity: EntityType) {
    navigate(`/risks-issues/${nextEntity}?view=all`)
  }

  function selectView(nextView: ViewKey) {
    navigate(`/risks-issues/${entity}?view=${nextView}`)
  }

  return (
    <Box
      sx={{
        mx: { xs: "-12px", md: "-24px" },
        mt: { xs: "-12px", md: "-24px" },
        mb: { xs: "-12px", md: "-24px" },
        height: "calc(100vh - 56px)",
        display: "flex",
        overflow: "hidden",
        bgcolor: "var(--color-background-tertiary)"
      }}
    >
      <Box
        sx={{
          width: 240,
          minWidth: 240,
          bgcolor: "var(--color-background-primary)",
          borderRight: "1px solid var(--color-border-primary)",
          overflowY: "auto",
          flexShrink: 0,
          p: 2
        }}
      >
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {([
            { key: "risks", label: "Risks" },
            { key: "issues", label: "Issues" }
          ] as const).map((item) => {
            const active = entity === item.key
            return (
              <Box
                key={item.key}
                onClick={() => selectEntity(item.key)}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderRadius: "7px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  border: active ? "1px solid rgba(29,78,216,0.24)" : "1px solid var(--color-border-primary)",
                  bgcolor: active ? "rgba(29,78,216,0.08)" : "transparent",
                  color: active ? "#1d4ed8" : "#64748b",
                  "&:hover": {
                    bgcolor: active ? "rgba(29,78,216,0.12)" : "rgba(0,0,0,0.03)"
                  }
                }}
              >
                {item.label}
              </Box>
            )
          })}
        </Stack>

        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "#94a3b8",
            mb: 1
          }}
        >
          {entity === "risks" ? "Risk views" : "Issue views"}
        </Typography>

        <Stack spacing={0.5}>
          {VIEW_ITEMS.map((item) => {
            const active = currentView === item.key
            return (
              <Box
                key={item.key}
                onClick={() => selectView(item.key)}
                sx={{
                  px: 1.25,
                  py: 0.9,
                  borderRadius: "7px",
                  cursor: "pointer",
                  borderLeft: active ? "2px solid #1d4ed8" : "2px solid transparent",
                  bgcolor: active ? "rgba(29,78,216,0.08)" : "transparent",
                  color: active ? "#1d4ed8" : "#334155",
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  "&:hover": {
                    bgcolor: active ? "rgba(29,78,216,0.12)" : "rgba(0,0,0,0.03)"
                  }
                }}
              >
                {item.label}
              </Box>
            )
          })}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: { xs: "12px", md: "20px" } }}>
        <Outlet />
      </Box>
    </Box>
  )
}
