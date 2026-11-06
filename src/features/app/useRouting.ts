import { useEffect, useLayoutEffect, useRef } from 'react'
import { hashToRoute, isNewHistoryStep, routeToHash, type Route } from '../../lib/routes'
import { useEditorStore } from '../../state/editorStore'
import { useLibraryStore } from '../../state/libraryStore'
import { CORE_CATALOG, useCoreStore } from '../../state/coreStore'
import { isCoreId } from '../../lib/core'
import { useWorkspaceStore, type View } from '../../state/workspaceStore'
import { t } from '../../i18n/i18n'

/** Whether the page a view names is still in the library. */
function viewExists(view: View): boolean {
  const separator = view.indexOf(':')
  if (separator < 0) return true
  const { libraries, shelves, notebooks, tags } = useLibraryStore.getState()
  const id = view.slice(separator + 1)
  const items: Array<{ id: string }> = view.startsWith('library:')
    ? [...CORE_CATALOG.libraries, ...libraries]
    : view.startsWith('shelf:')
      ? [...CORE_CATALOG.shelves, ...shelves]
      : view.startsWith('notebook:') ? [...CORE_CATALOG.notebooks, ...notebooks] : tags
  return items.some((item) => item.id === id)
}

const urlFor = (route: Route) => `${window.location.pathname}${window.location.search}${routeToHash(route)}`

/**
 * Keeps the page's address in step with where the reader is, so Back and Forward move between
 * pages and notes, a reload stays on the same page, and an address can be bookmarked.
 *
 * Once the library has loaded, the address is read and shown: a page or note no longer in the
 * library falls back to Home, with a notice saying so. From then on, each move to another page
 * or note adds a step to the browser's history, and typing a search updates the current step.
 * `onHistoryMove` runs after Back or Forward, with the route now shown.
 */
export function useRouting({ ready, onHistoryMove }: { ready: boolean; onHistoryMove: (route: Route) => void }) {
  const view = useWorkspaceStore((state) => state.view)
  const query = useWorkspaceStore((state) => state.query)
  const noteId = useEditorStore((state) => state.activeNote?.id)
  const started = useRef(false)
  const shown = useRef<Route>({ view: 'all' })
  const onHistoryMoveRef = useRef(onHistoryMove)
  useLayoutEffect(() => {
    onHistoryMoveRef.current = onHistoryMove
  })

  useEffect(() => {
    if (!ready) return
    const show = (fromHistory: boolean) => {
      const route = hashToRoute(window.location.hash)
      // A link to a heading inside a note, not a page.
      if (!route) return
      // A handbook note's text loads separately; show the address once it has.
      const core = useCoreStore.getState()
      if (isCoreId(route.note) && !core.loaded && !core.failed) {
        void core.load().then(() => show(fromHistory))
        return
      }
      const workspace = useWorkspaceStore.getState()
      const editor = useEditorStore.getState()
      // On opening the app, the address only adds what it names: a search typed or a note opened
      // while the library loaded is kept. Back and Forward show exactly the step in history.
      const keepCurrent = !fromHistory
      const view = viewExists(route.view) ? route.view : 'home'
      if (view !== route.view) workspace.showNotice(t('That page is no longer in your library.'))
      if (!keepCurrent || route.view !== 'home' || view !== route.view) workspace.setView(view)
      if (!keepCurrent || route.query) workspace.setQuery(route.query ?? '')
      if (route.note !== editor.activeNote?.id && (!keepCurrent || route.note)) {
        const { notes, trash } = useLibraryStore.getState()
        const found = route.note
          ? notes.find((item) => item.id === route.note) ?? trash.find((item) => item.id === route.note) ?? useCoreStore.getState().notes.find((item) => item.id === route.note)
          : undefined
        if (found) editor.open(found)
        else {
          // Closing the editor saves the note it had open.
          editor.close()
          if (route.note) workspace.showNotice(t('That note could not be found. It may have been deleted, or never saved.'))
        }
      }
      const current = useWorkspaceStore.getState()
      const noteId = useEditorStore.getState().activeNote?.id
      shown.current = { view: current.view, ...(noteId ? { note: noteId } : {}), ...(current.query ? { query: current.query } : {}) }
      if (routeToHash(shown.current) !== window.location.hash) window.history.replaceState(window.history.state, '', urlFor(shown.current))
      if (fromHistory) onHistoryMoveRef.current(shown.current)
    }
    show(false)
    started.current = true
    const onPopState = () => show(true)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [ready])

  // Read from the stores, not this render: on the first run they already hold the address just shown.
  useEffect(() => {
    if (!started.current) return
    const { view, query } = useWorkspaceStore.getState()
    const noteId = useEditorStore.getState().activeNote?.id
    const next: Route = { view, ...(noteId ? { note: noteId } : {}), ...(query ? { query } : {}) }
    if (routeToHash(next) === window.location.hash) {
      shown.current = next
      return
    }
    if (isNewHistoryStep(shown.current, next)) window.history.pushState(null, '', urlFor(next))
    else window.history.replaceState(window.history.state, '', urlFor(next))
    shown.current = next
  }, [view, query, noteId])
}
