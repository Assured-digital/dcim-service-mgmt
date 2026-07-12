import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Box, Breadcrumbs, Button, Card, IconButton, InputAdornment, Link, Stack, TextField, Tooltip, Typography
} from "@mui/material"
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined"
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined"
import SearchIcon from "@mui/icons-material/Search"
import HomeIcon from "@mui/icons-material/Home"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import {
  browseDocuments, listPinnedDocuments, pinDocument, searchDocuments,
  type DriveItem
} from "../lib/crm"

function fmtSize(bytes?: number) {
  if (!bytes) return ""
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function CrmDocumentsPage() {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const canPin = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [subPath, setSubPath] = React.useState("")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [activeSearch, setActiveSearch] = React.useState("")

  const browse = useQuery({
    queryKey: ["crm-documents", subPath],
    queryFn: () => browseDocuments(subPath || undefined),
    enabled: !activeSearch,
  })
  const search = useQuery({
    queryKey: ["crm-documents-search", activeSearch],
    queryFn: () => searchDocuments(activeSearch),
    enabled: !!activeSearch,
  })
  const pinned = useQuery({ queryKey: ["documents-pinned"], queryFn: listPinnedDocuments })

  const pinMutation = useMutation({
    mutationFn: (item: DriveItem) => pinDocument({ title: item.name, url: item.webUrl, docType: item.isFolder ? "folder" : "sharepoint" }),
    onSuccess: () => { notify.success("Pinned to client"); qc.invalidateQueries({ queryKey: ["documents-pinned"] }) },
    onError: () => notify.error("Couldn't pin document"),
  })

  const result = activeSearch ? search.data : browse.data
  const loading = activeSearch ? search.isLoading : browse.isLoading
  const isError = activeSearch ? search.isError : browse.isError

  function openFolder(name: string) {
    setSubPath(p => (p ? `${p}/${name}` : name))
  }
  function crumbTo(idx: number) {
    const parts = subPath.split("/").filter(Boolean)
    setSubPath(parts.slice(0, idx + 1).join("/"))
  }
  function runSearch() {
    setActiveSearch(searchTerm.trim())
  }
  function clearSearch() {
    setActiveSearch("")
    setSearchTerm("")
  }

  const pinnedUrls = new Set((pinned.data ?? []).map(p => p.url))

  return (
    <Box>
      <Card>
        {/* Toolbar */}
        <Box sx={{
          borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.25,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap"
        }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Documents</Typography>
          <TextField
            size="small" placeholder="Search this client's files…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") runSearch() }}
            sx={{ width: 280 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
              endAdornment: activeSearch ? <Button size="small" onClick={clearSearch}>Clear</Button> : null
            }}
          />
        </Box>

        {/* Breadcrumb (browse mode) */}
        {!activeSearch && browse.data?.status === "ok" ? (
          <Box sx={{ px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
            <Breadcrumbs separator="›" sx={{ fontSize: 12.5 }}>
              <Link component="button" underline="hover" onClick={() => setSubPath("")}
                sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: 12.5 }}>
                <HomeIcon sx={{ fontSize: 15 }} /> {browse.data.folderPath}
              </Link>
              {subPath.split("/").filter(Boolean).map((seg, i) => (
                <Link key={i} component="button" underline="hover" onClick={() => crumbTo(i)} sx={{ fontSize: 12.5 }}>
                  {seg}
                </Link>
              ))}
            </Breadcrumbs>
          </Box>
        ) : null}

        <Box sx={{ p: 2 }}>
          {loading ? <LoadingState /> : isError ? (
            <ErrorState title="Couldn't reach SharePoint" detail="The Graph request failed. Check the integration configuration." />
          ) : result?.status === "disabled" ? (
            <EmptyState title="SharePoint integration is off"
              detail="Set GRAPH_ENABLED and grant the app Sites.Selected on the client sites to browse documents here." />
          ) : result?.status === "unmapped" ? (
            <EmptyState title="No SharePoint site mapped"
              detail="Set this client's SharePoint site in Admin → Clients to browse its documents." />
          ) : (result?.items.length ?? 0) === 0 ? (
            <EmptyState title={activeSearch ? "No matches" : "Empty folder"}
              detail={activeSearch ? "No files matched your search." : "This folder has no files yet."} />
          ) : (
            <Stack spacing={0.25}>
              {result!.items.map(item => {
                const isPinned = pinnedUrls.has(item.webUrl)
                return (
                  <Box key={item.id} sx={{
                    display: "flex", alignItems: "center", gap: 1.25, px: 1, py: 0.75, borderRadius: "6px",
                    "&:hover": { bgcolor: "rgba(29,78,216,0.04)", "& .doc-actions": { opacity: 1 } }
                  }}>
                    {item.isFolder ? (
                      <FolderOutlinedIcon sx={{ fontSize: 19, color: "#eab308" }} />
                    ) : (
                      <InsertDriveFileOutlinedIcon sx={{ fontSize: 19, color: "var(--color-text-muted)" }} />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {item.isFolder && !activeSearch ? (
                        <Link component="button" underline="hover" onClick={() => openFolder(item.name)}
                          sx={{ fontSize: 13, fontWeight: 600, textAlign: "left" }}>{item.name}</Link>
                      ) : (
                        <Typography sx={{ fontSize: 13, fontWeight: item.isFolder ? 600 : 500 }} noWrap>{item.name}</Typography>
                      )}
                      <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        {item.isFolder ? `${item.childCount ?? 0} items` : fmtSize(item.size)}
                        {item.lastModifiedDateTime ? ` · ${new Date(item.lastModifiedDateTime).toLocaleDateString("en-GB")}` : ""}
                      </Typography>
                    </Box>
                    <Box className="doc-actions" sx={{ display: "flex", gap: 0.5, opacity: 0, transition: "opacity 0.15s" }}>
                      <Tooltip title="Open in SharePoint">
                        <IconButton size="small" component="a" href={item.webUrl} target="_blank" rel="noopener noreferrer">
                          <OpenInNewIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      {canPin ? (
                        <Tooltip title={isPinned ? "Already pinned" : "Pin to client"}>
                          <span>
                            <IconButton size="small" disabled={isPinned || pinMutation.isPending}
                              onClick={() => pinMutation.mutate(item)}>
                              <PushPinOutlinedIcon sx={{ fontSize: 16, color: isPinned ? "#1d4ed8" : undefined }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      ) : null}
                    </Box>
                  </Box>
                )
              })}
            </Stack>
          )}
        </Box>
      </Card>

      {/* Pinned documents */}
      {(pinned.data ?? []).length > 0 ? (
        <Card sx={{ mt: 2, p: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>Pinned documents</Typography>
          <Stack spacing={0.5}>
            {(pinned.data ?? []).map(p => (
              <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PushPinOutlinedIcon sx={{ fontSize: 15, color: "#1d4ed8" }} />
                <Link href={p.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>
                  {p.title}
                </Link>
                <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {new Date(p.createdAt).toLocaleDateString("en-GB")}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Card>
      ) : null}

      {browse.data?.status === "disabled" ? (
        <Alert severity="info" sx={{ mt: 2, fontSize: 12.5 }}>
          App-only Graph access (managed identity). Client → folder mapping is set per client in Admin → Clients.
        </Alert>
      ) : null}
    </Box>
  )
}
