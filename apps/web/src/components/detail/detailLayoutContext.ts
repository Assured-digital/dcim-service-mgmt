import { createContext, useContext } from "react"

// True when the detail shell is rendered inside the narrow association-peek drawer.
// Drives single-column stacking + suppression of the redundant inner top row
// (the drawer's own chrome already provides close / open-full). Default false →
// standalone routes and the depth-1 navigator panel stay two-column with their top bar.
const DetailNarrowContext = createContext(false)
export const DetailNarrowProvider = DetailNarrowContext.Provider
export const useDetailNarrow = () => useContext(DetailNarrowContext)

// Drawer chrome bridge: the drawer header is rendered by ServiceDeskNavigator (the
// PARENT of the detail page), but the status control + overflow live in the detail
// shell (the CHILD). The navigator publishes a DOM slot in its header for the shell to
// portal its status cluster into, plus the "Open full" navigation action (which the
// shell folds into its overflow menu). Null on the main page (no drawer chrome).
export interface DetailDrawerChrome {
  headerSlot: HTMLElement | null
  onOpenFull: () => void
}
const DetailDrawerChromeContext = createContext<DetailDrawerChrome | null>(null)
export const DetailDrawerChromeProvider = DetailDrawerChromeContext.Provider
export const useDetailDrawerChrome = () => useContext(DetailDrawerChromeContext)
