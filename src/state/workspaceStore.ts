import { create } from 'zustand'
import type { StructureItem } from './actions'
import { recordProblem } from './problemStore'

export type View =
  /** The library entrance: continue reading, libraries, recently added. */
  | 'home'
  /** Every personal note. */
  | 'all'
  /** One search across the handbooks and your notes. */
  | 'search'
  | 'favorites'
  | 'trash'
  | 'graph'
  | `library:${string}`
  | `shelf:${string}`
  | `notebook:${string}`
  | `tag:${string}`

// Phones and tablets: the navigation is a drawer over the page (design specification, section 3).
const COMPACT_NAVIGATION_QUERY = '(max-width: 1199px)'

export function matchesCompactNavigation(): boolean {
  return window.matchMedia?.(COMPACT_NAVIGATION_QUERY).matches ?? false
}

export function compactNavigationQuery(): MediaQueryList | undefined {
  return window.matchMedia?.(COMPACT_NAVIGATION_QUERY)
}

interface WorkspaceState {
  view: View
  query: string
  /** Desktop sidebar collapsed to the edge. */
  sidebarCollapsed: boolean
  /** Compact screens: the navigation drawer is open. */
  navigationOpen: boolean
  isCompactNavigation: boolean
  /** Libraries and shelves the reader opened or closed in the sidebar; others follow the default. */
  treeChoices: Record<string, boolean>
  error: string | null
  notice: string | null
  /** The library, shelf, or notebook the delete dialog is open for. */
  structureToDelete: StructureItem | null
  setView: (view: View) => void
  /** The note the note map should open around, when sent there from a note. */
  graphFocusId: string | null
  setGraphFocus: (noteId: string | null) => void
  setQuery: (query: string) => void
  toggleSidebar: () => void
  setNavigationOpen: (open: boolean) => void
  setCompactNavigation: (compact: boolean) => void
  setTreeOpen: (id: string, open: boolean) => void
  showError: (message: string | null) => void
  showNotice: (message: string | null) => void
  askToDelete: (target: StructureItem | null) => void
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  view: 'home',
  query: '',
  sidebarCollapsed: false,
  navigationOpen: false,
  isCompactNavigation: matchesCompactNavigation(),
  treeChoices: {},
  error: null,
  notice: null,
  structureToDelete: null,
  setView: (view) => set({ view }),
  graphFocusId: null,
  setGraphFocus: (graphFocusId) => set({ graphFocusId }),
  setQuery: (query) => set({ query }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setNavigationOpen: (navigationOpen) => set({ navigationOpen }),
  // Leaving compact layout always closes the drawer.
  setCompactNavigation: (isCompactNavigation) =>
    set((state) => ({ isCompactNavigation, navigationOpen: isCompactNavigation && state.navigationOpen })),
  setTreeOpen: (id, open) => set((state) => ({ treeChoices: { ...state.treeChoices, [id]: open } })),
  showError: (error) => {
    if (error) recordProblem(error, 'shown')
    set({ error })
  },
  showNotice: (notice) => set({ notice }),
  askToDelete: (structureToDelete) => set({ structureToDelete }),
}))

/** Shows a failure's own message when it has one, otherwise the given fallback. */
export function reportError(reason: unknown, fallback: string) {
  useWorkspaceStore.getState().showError(reason instanceof Error ? reason.message : fallback)
}
