import type { View } from '../state/workspaceStore'

/**
 * Where the reader is, kept in the page's address so Back, Forward, reloading, and links work:
 * the page (a view), the note open over it, and the search typed there.
 *
 * Addresses use the part after "#" (`#/notebook/<id>?note=<id>&q=<search>`), which works on any
 * static host, GitHub Pages included, and offline, with no server rewrites. A "#" address not
 * starting with "#/" is a link inside a note, not a page, and is left alone.
 */
export interface Route {
  view: View
  /** The open note's id (a new note has one from the start, before it is saved). */
  note?: string
  /** The search typed on the page. */
  query?: string
}

// Pages with a fixed address; All Notes is "#/notes", and Home is "#/".
const PAGES = new Set(['notes', 'search', 'favorites', 'trash', 'graph'])
const ITEMS = new Set(['library', 'shelf', 'notebook', 'tag'])

export function routeToHash(route: Route): string {
  const separator = route.view.indexOf(':')
  const path = route.view === 'home'
    ? ''
    : route.view === 'all'
      ? 'notes'
      : separator < 0
      ? route.view
      : `${route.view.slice(0, separator)}/${encodeURIComponent(route.view.slice(separator + 1))}`
  const params = new URLSearchParams()
  if (route.note) params.set('note', route.note)
  if (route.query) params.set('q', route.query)
  const search = params.toString()
  return `#/${path}${search ? `?${search}` : ''}`
}

/** The route in an address's hash; null when the hash is not a page address. */
export function hashToRoute(hash: string): Route | null {
  if (hash === '' || hash === '#') return { view: 'home' }
  if (!hash.startsWith('#/')) return null
  const rest = hash.slice(2)
  const questionMark = rest.indexOf('?')
  const path = questionMark < 0 ? rest : rest.slice(0, questionMark)
  const params = new URLSearchParams(questionMark < 0 ? '' : rest.slice(questionMark + 1))
  const parts = path.split('/').filter(Boolean)
  let view: View | undefined
  if (parts.length === 0) view = 'home'
  else if (parts.length === 1 && PAGES.has(parts[0])) view = (parts[0] === 'notes' ? 'all' : parts[0]) as View
  else if (parts.length === 2 && ITEMS.has(parts[0])) {
    try {
      view = `${parts[0]}:${decodeURIComponent(parts[1])}` as View
    } catch {
      return null
    }
  }
  if (!view) return null
  const note = params.get('note') || undefined
  const query = params.get('q') || undefined
  return { view, ...(note ? { note } : {}), ...(query ? { query } : {}) }
}

/**
 * Whether moving from one route to the next is a new step in history (Back returns to it), or only
 * an update of the current step, as when typing a search.
 */
export function isNewHistoryStep(from: Route, to: Route): boolean {
  return from.view !== to.view || from.note !== to.note
}
