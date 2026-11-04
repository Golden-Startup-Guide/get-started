import { useEffect, useRef, useState } from 'react'
import { isEmptyQuery, type Locations, type SearchQuery } from '../../lib/search'
import type { Note } from '../../types'
import type { SearchableNote, SearchWorkerRequest, SearchWorkerResponse } from './search.worker'

/** Libraries with at least this many notes (including Trash) are searched in a worker. */
export const WORKER_SEARCH_THRESHOLD = 5_000
/** Notes sent to the worker per step; steps run in idle time so the page stays responsive. */
export const SYNC_BATCH_SIZE = 2_000

export interface SearchMatches {
  /** IDs of the notes matching the query, once known. */
  ids: Set<string> | undefined
  /** A newer query is still being answered. */
  pending: boolean
  /** False when the worker cannot run; search then happens on the main thread. */
  available: boolean
  /**
   * The worker holds the current library. Until then, search on the main thread as for small
   * libraries, so the first results never wait for the worker's copy.
   */
  ready: boolean
}

const searchable = (note: Note, attached: ReadonlySet<string>): SearchableNote => ({
  id: note.id,
  title: note.title,
  content: note.content,
  tags: note.tags,
  notebookId: note.notebookId,
  pinned: note.pinned,
  favorite: note.favorite,
  updatedAt: note.updatedAt,
  attached: attached.has(note.id),
})

/**
 * Searches a large library in a Web Worker (search.worker.ts), so a keystroke in the search box
 * never waits for every note to be checked.
 *
 * The worker starts when search is about to be used (`primed`: the search box has focus) or is
 * used, and keeps a copy of the library, updated with only the notes added, changed, or removed.
 * The first copy is sent in batches between which the page can respond; queries wait until the
 * worker has everything, so results are never partial.
 *
 * Disabled (`enabled` false) for smaller libraries, which search on the main thread instantly.
 */
export function useSearchMatches(
  notes: readonly Note[],
  query: SearchQuery,
  locations: Locations,
  attached: ReadonlySet<string>,
  enabled: boolean,
  primed = false,
): SearchMatches {
  const workerRef = useRef<Worker>()
  // What the worker has: each note's updatedAt, which of them have attachments, and the locations.
  const sentRef = useRef(new Map<string, number>())
  const sentAttachedRef = useRef(new Set<string>())
  const sentLocationsRef = useRef<Locations>()
  const latestQueryId = useRef(0)
  const queriesRef = useRef(new Map<number, SearchQuery>())
  // The library version the worker holds completely; queries wait for it to match `notes`.
  const [synced, setSynced] = useState<{ notes: readonly Note[]; locations: Locations; attached: ReadonlySet<string> }>()
  // The newest answer, with the query it answers: while it is for an older query, a search is pending.
  const [result, setResult] = useState<{ query: SearchQuery; ids: Set<string> }>()
  const [failed, setFailed] = useState(false)
  const available = enabled && !failed && typeof Worker !== 'undefined'
  const searching = available && !isEmptyQuery(query)
  const active = available && (primed || searching)
  const ready = synced?.notes === notes && synced.locations === locations && synced.attached === attached

  useEffect(() => () => workerRef.current?.terminate(), [])

  // Keep the worker's copy in step with the library.
  useEffect(() => {
    if (!active) return
    let worker = workerRef.current
    if (!worker) {
      worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
        // Only the newest query's answer is shown; older ones arrive late and are dropped.
        const answered = queriesRef.current.get(event.data.id)
        queriesRef.current.delete(event.data.id)
        if (answered && event.data.id === latestQueryId.current) setResult({ query: answered, ids: new Set(event.data.ids) })
      }
      worker.onerror = () => setFailed(true)
      workerRef.current = worker
    }
    const target = worker
    const sent = sentRef.current
    const sentAttached = sentAttachedRef.current
    const changed: Note[] = []
    const present = new Set<string>()
    for (const note of notes) {
      present.add(note.id)
      if (sent.get(note.id) !== note.updatedAt || sentAttached.has(note.id) !== attached.has(note.id)) changed.push(note)
    }
    const removals: string[] = []
    for (const id of sent.keys()) if (!present.has(id)) removals.push(id)
    for (const id of removals) {
      sent.delete(id)
      sentAttached.delete(id)
    }
    const locationsChanged = sentLocationsRef.current !== locations
    if (removals.length || locationsChanged) {
      target.postMessage({ type: 'sync', upserts: [], removals, locations: locationsChanged ? locations : undefined } satisfies SearchWorkerRequest)
      sentLocationsRef.current = locations
    }

    let cancelled = false
    let cancelNext = () => {}
    // Steps of a large copy run only when the browser is idle, so they never hold up a keystroke,
    // a search on the page, or a screen update (copying 2,000 notes takes tens of milliseconds).
    // Safari has no requestIdleCallback; there a short pause between steps stands in for it.
    const whenIdle = (step: () => void) => {
      if (window.requestIdleCallback) {
        const handle = window.requestIdleCallback(step, { timeout: 2000 })
        cancelNext = () => window.cancelIdleCallback(handle)
      } else {
        const timer = window.setTimeout(step, 50)
        cancelNext = () => window.clearTimeout(timer)
      }
    }
    const sendFrom = (start: number) => {
      if (cancelled) return
      const batch = changed.slice(start, start + SYNC_BATCH_SIZE)
      if (batch.length) {
        target.postMessage({ type: 'sync', upserts: batch.map((note) => searchable(note, attached)), removals: [] } satisfies SearchWorkerRequest)
        for (const note of batch) {
          sent.set(note.id, note.updatedAt)
          if (attached.has(note.id)) sentAttached.add(note.id)
          else sentAttached.delete(note.id)
        }
      }
      if (start + SYNC_BATCH_SIZE < changed.length) whenIdle(() => sendFrom(start + SYNC_BATCH_SIZE))
      else setSynced({ notes, locations, attached })
    }
    // A few changed notes (an edit) go at once; a whole library goes in idle steps.
    if (changed.length <= SYNC_BATCH_SIZE) sendFrom(0)
    else whenIdle(() => sendFrom(0))
    return () => {
      cancelled = true
      cancelNext()
    }
  }, [active, notes, locations, attached])

  // Ask once the worker holds this version of the library.
  useEffect(() => {
    const worker = workerRef.current
    if (!searching || !ready || !worker) return
    const id = ++latestQueryId.current
    queriesRef.current.set(id, query)
    worker.postMessage({ type: 'query', id, query } satisfies SearchWorkerRequest)
  }, [searching, ready, query])

  return {
    ids: searching ? result?.ids : undefined,
    pending: searching && (!ready || result?.query !== query),
    available,
    ready: available && ready,
  }
}
