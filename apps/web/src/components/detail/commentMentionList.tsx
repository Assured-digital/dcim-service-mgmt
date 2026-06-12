import * as React from "react"
import { MenuItem, MenuList, Paper, Popper, Typography } from "@mui/material"

// ─────────────────────────────────────────────────────────────────────────────
// @-mention autocomplete dropdown for the comment editor.
//
// Rendered by TipTap's suggestion pipeline via a ReactRenderer (a separate React
// root, OUTSIDE the app tree) — so it stays purely presentational: the candidate
// list + command come in as suggestion props; no hooks/context of its own. It
// positions itself with a MUI Popper anchored to a virtual element built from the
// caret rect the suggestion utility supplies (clientRect).
// ─────────────────────────────────────────────────────────────────────────────

export interface MentionItem {
  id: string
  label: string
  email: string
}

// The subset of TipTap suggestion props this list consumes.
interface MentionListProps {
  items: MentionItem[]
  command: (item: { id: string; label: string }) => void
  clientRect?: (() => DOMRect | null) | null
}

// Imperative handle the suggestion pipeline calls for keyboard nav (arrows/enter
// are routed here so they don't reach the editor while the dropdown is open).
export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export const MentionList = React.forwardRef<MentionListRef, MentionListProps>(
  function MentionList(props, ref) {
    const { items, command, clientRect } = props
    const [selectedIndex, setSelectedIndex] = React.useState(0)

    // Reset the highlight whenever the candidate set changes (e.g. as the query
    // narrows the list while typing after @).
    React.useEffect(() => setSelectedIndex(0), [items])

    const selectItem = React.useCallback(
      (index: number) => {
        const item = items[index]
        if (item) command({ id: item.id, label: item.label })
      },
      [items, command]
    )

    React.useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (!items.length) return false
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    // Virtual anchor: a stand-in element exposing the caret's bounding rect so the
    // Popper tracks the @ position as the user types.
    const anchorEl = React.useMemo(
      () =>
        clientRect
          ? { getBoundingClientRect: () => clientRect() ?? new DOMRect() }
          : null,
      [clientRect]
    )

    if (!anchorEl || !items.length) return null

    return (
      <Popper
        open
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1500 }}
        modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
      >
        <Paper
          elevation={4}
          sx={{ maxHeight: 260, overflowY: "auto", minWidth: 240, py: 0.5 }}
        >
          <MenuList dense disablePadding>
            {items.map((item, i) => (
              <MenuItem
                key={item.id}
                selected={i === selectedIndex}
                // mousedown (not click) + preventDefault keeps editor focus so the
                // suggestion command inserts the node cleanly.
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectItem(i)
                }}
                sx={{ display: "block", py: 0.5 }}
              >
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                  {item.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap display="block">
                  {item.email}
                </Typography>
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popper>
    )
  }
)
