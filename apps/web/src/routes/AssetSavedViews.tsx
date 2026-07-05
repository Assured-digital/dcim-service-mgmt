import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, ListItemText, Menu, MenuItem, TextField, Typography
} from "@mui/material"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import { ToolbarButton } from "../components/shared/ListToolbar"
import { FilterState, serializeFilters, deserializeFilters } from "./assetRegisterFilters"
import { SavedView, deleteView, listSavedViews, saveView } from "../lib/savedViews"

// Saved-views control for the register toolbar: a dropdown of the current
// client's saved views + "Save current view…". Applying a view swaps in its
// filters; the active view is tracked only to label the button.
export function AssetSavedViews({ filters, onApply }: {
  filters: FilterState
  onApply: (next: FilterState) => void
}) {
  const [views, setViews] = React.useState<SavedView[]>(() => listSavedViews())
  const [anchor, setAnchor] = React.useState<null | HTMLElement>(null)
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const refresh = () => setViews(listSavedViews())
  const active = views.find(v => v.id === activeId)

  function apply(v: SavedView) {
    onApply(deserializeFilters(v.filters))
    setActiveId(v.id)
    setAnchor(null)
  }
  function commitSave() {
    if (!name.trim()) return
    const next = saveView(name, serializeFilters(filters))
    setViews(next)
    setActiveId(next.find(v => v.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null)
    setName(""); setSaveOpen(false)
  }
  function remove(id: string) {
    setViews(deleteView(id))
    if (activeId === id) setActiveId(null)
  }

  return (
    <>
      <ToolbarButton onClick={e => { refresh(); setAnchor(e.currentTarget) }}
        startIcon={<BookmarkBorderIcon sx={{ fontSize: "15px !important" }} />}
        endIcon={<KeyboardArrowDownIcon sx={{ fontSize: "16px !important" }} />}>
        {active ? active.name : "Views"}
      </ToolbarButton>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: 0.5 } } }}>
        {views.length === 0 ? (
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No saved views yet.</Typography>
          </Box>
        ) : views.map(v => (
          <MenuItem key={v.id} selected={v.id === activeId} onClick={() => apply(v)} sx={{ py: 0.5 }}>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>{v.name}</ListItemText>
            <IconButton size="small" edge="end" onClick={e => { e.stopPropagation(); remove(v.id) }}
              sx={{ ml: 1, color: "text.tertiary", "&:hover": { color: "error.main" } }}>
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </MenuItem>
        ))}
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", mt: 0.5, pt: 0.5 }}>
          <MenuItem onClick={() => { setAnchor(null); setSaveOpen(true) }} sx={{ py: 0.75 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "primary.main" }}>Save current view…</Typography>
          </MenuItem>
        </Box>
      </Menu>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Save view</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
            Save the current search and filters as a named view. Reusing a name overwrites it.
          </Typography>
          <TextField size="small" autoFocus fullWidth label="View name" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitSave() }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setSaveOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button size="small" variant="contained" disabled={!name.trim()} onClick={commitSave} sx={{ textTransform: "none" }}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
