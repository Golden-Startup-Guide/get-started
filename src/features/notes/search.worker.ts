/// <reference lib="webworker" />
import { matchesQuery, prepareForSearch, pruneSearchCache, type Locations, type SearchQuery } from '../../lib/search'
import type { Note } from '../../types'

/**
 * Searches large libraries off the main thread, so typing in the search box never waits. It keeps
 * its own copy of each note's searchable fields, updated with only what changed, and answers
 * queries with the IDs of the matching notes. Matching is lib/search.ts, as on the main thread.
 */
export type SearchableNote = Pick<Note, 'id' | 'title' | 'content' | 'tags' | 'notebookId' | 'pinned' | 'favorite' | 'updatedAt'>

export type SearchWorkerRequest =
  | { type: 'sync'; upserts: SearchableNote[]; removals: string[]; locations?: Locations }
  | { type: 'query'; id: number; query: SearchQuery }

export interface SearchWorkerResponse {
  id: number
  ids: string[]
}

const notes = new Map<string, SearchableNote>()
let locations: Locations = new Map()
// Notes whose lower-cased text is not prepared yet; done between messages, so the first search
// after the library arrives does not have to do it.
const unprepared: SearchableNote[] = []
let preparing: ReturnType<typeof setTimeout> | undefined

function prepareSome() {
  preparing = undefined
  const deadline = performance.now() + 20
  while (unprepared.length && performance.now() < deadline) prepareForSearch(unprepared.pop() as Note)
  if (unprepared.length) preparing = setTimeout(prepareSome, 0)
}

self.onmessage = (event: MessageEvent<SearchWorkerRequest>) => {
  const message = event.data
  if (message.type === 'sync') {
    for (const note of message.upserts) notes.set(note.id, note)
    for (const id of message.removals) notes.delete(id)
    if (message.removals.length) pruneSearchCache(notes.keys())
    if (message.locations) locations = message.locations
    if (message.upserts.length) {
      unprepared.push(...message.upserts)
      preparing ??= setTimeout(prepareSome, 0)
    }
    return
  }
  const ids: string[] = []
  for (const note of notes.values()) {
    if (matchesQuery(note as Note, message.query, locations)) ids.push(note.id)
  }
  self.postMessage({ id: message.id, ids } satisfies SearchWorkerResponse)
}
