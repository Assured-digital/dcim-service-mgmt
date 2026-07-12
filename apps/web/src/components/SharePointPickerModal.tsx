import React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Box, Breadcrumbs, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, InputAdornment, Link, TextField, Typography
} from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import CloseIcon from "@mui/icons-material/Close"
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined"
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined"
import { browseSharePoint, searchSharePoint, type DriveItem } from "../lib/documents"

interface Props {
  open: boolean
  onClose: () => void
  onPick: (item: DriveItem) => void
}

// Browse/search the client's SharePoint Documents library and pick a FILE to link
// onto the current record. Folders navigate; files are selectable. Mirrors the CRM
// Documents browser but scoped for a modal picker.
export function SharePointPickerModal({ open, onClose, onPick }: Props) {
  const [subPath, setSubPath] = React.useState("")
  const [term, setTerm] = React.useState("")
  const activeSearch = term.trim().length > 0

  // Reset navigation each time the picker opens.
  React.useEffect(() => {
    if (open) { setSubPath(""); setTerm("") }
  }, [open])

  const browseQ = useQuery({
    queryKey: ["sp-browse", subPath],
    queryFn: () => browseSharePoint(subPath),
    enabled: open && !activeSearch
  })
  const searchQ = useQuery({
    queryKey: ["sp-search", term.trim()],
    queryFn: () => searchSharePoint(term.trim()),
    enabled: open && activeSearch
  })

  const result = activeSearch ? searchQ.data : browseQ.data
  const loading = activeSearch ? searchQ.isLoading : browseQ.isLoading
  const items = result?.status === "ok" ? result.items : []
  const crumbs = subPath.split("/").filter(Boolean)

  const enter = (item: DriveItem) => {
    if (item.isFolder) {
      setTerm("")
      setSubPath((p) => (p ? `${p}/${item.name}` : item.name))
    } else {
      onPick(item)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <span>Link a SharePoint document</span>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search documents…"
          size="small"
          fullWidth
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ mb: 1.5 }}
        />

        {!activeSearch ? (
          <Breadcrumbs sx={{ mb: 1, fontSize: 12.5 }}>
            <Link component="button" underline="hover" onClick={() => setSubPath("")} sx={{ fontSize: 12.5 }}>Home</Link>
            {crumbs.map((seg, i) => (
              <Link key={i} component="button" underline="hover" onClick={() => setSubPath(crumbs.slice(0, i + 1).join("/"))} sx={{ fontSize: 12.5 }}>
                {seg}
              </Link>
            ))}
          </Breadcrumbs>
        ) : null}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={22} /></Box>
        ) : result?.status === "disabled" ? (
          <Empty text="SharePoint integration is off." />
        ) : result?.status === "unmapped" ? (
          <Empty text="This client has no SharePoint site set (Admin → Clients)." />
        ) : items.length === 0 ? (
          <Empty text={activeSearch ? "No documents matched your search." : "This folder is empty."} />
        ) : (
          <Box>
            {items.map((item) => (
              <Box
                key={item.id}
                onClick={() => enter(item)}
                sx={{
                  display: "flex", alignItems: "center", gap: 1.25, px: 1, py: 0.75, borderRadius: 1, cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" }
                }}
              >
                {item.isFolder
                  ? <FolderOutlinedIcon sx={{ fontSize: 19, color: "#eab308" }} />
                  : <InsertDriveFileOutlinedIcon sx={{ fontSize: 19, color: "text.secondary" }} />}
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name}
                </Typography>
                {!item.isFolder ? (
                  <Typography sx={{ fontSize: 11, color: "primary.main" }}>Link</Typography>
                ) : null}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Empty({ text }: { text: string }) {
  return <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 4 }}>{text}</Typography>
}
