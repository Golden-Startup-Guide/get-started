import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLocations, matchesQuery, parseSearchQuery, type Locations } from '../../lib/search'
import type { Note } from '../../types'
import type { SearchableNote, SearchWorkerRequest } from './search.worker'
import { SYNC_BATCH_SIZE, useSearchMatches } from './useSearchMatches'

// A stand-in worker that runs the real matching code, recording what it was sent.
class FakeWorker {
  static instances: FakeWorker[] = []
  messages: SearchWorkerRequest[] = []
  onmessage?: (event: MessageEvent) => void
  onerror?: () => void
  /** Hold answers back, to test answers that arrive late. */
  hold = false
  held: Array<() => void> = []
  private notes = new Map<string, SearchableNote>()
  private locations: Locations = new Map()
  private attached = new Set<string>()
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(message: SearchWorkerRequest) {
    this.messages.push(message)
    if (message.type === 'sync') {
      for (const note of message.upserts) {
        this.notes.set(note.id, note)
        if (note.attached) this.attached.add(note.id)
        else this.attached.delete(note.id)
      }
      for (const id of message.removals) this.notes.delete(id)
      if (message.locations) this.locations = message.locations
      return
    }
    const ids = [...this.notes.values()].filter((note) => matchesQuery(note, message.query, this.locations, this.attached)).map((note) => note.id)
    const answer = () => this.onmessage?.({ data: { id: message.id, ids } } as MessageEvent)
    if (this.hold) this.held.push(answer)
    else setTimeout(answer, 0)
  }
  terminate() {}
}

const note = (index: number, content = 'plain'): Note =>
  ({ id: `n${index}`, title: `Note ${index}`, content, createdAt: 1, updatedAt: 1, notebookId: 'nb' })
const locations = buildLocations([], [], [])
const noAttachments: ReadonlySet<string> = new Set()
const library = Array.from({ length: SYNC_BATCH_SIZE * 2 + 500 }, (_, index) => note(index, index % 1000 === 0 ? 'rare word' : 'plain'))
const upsertBatches = (worker: FakeWorker) => worker.messages.filter((message) => message.type === 'sync' && message.upserts.length).length
const queries = (worker: FakeWorker) => worker.messages.filter((message) => message.type === 'query')

describe('useSearchMatches', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the library in batches when primed, and asks only once the worker has all of it', async () => {
    const empty = parseSearchQuery('')
    const { result, rerender } = renderHook(({ query }) => useSearchMatches(library, query, locations, noAttachments, true, true), { initialProps: { query: empty } })
    const worker = FakeWorker.instances[0]
    expect(worker).toBeDefined()
    // Two full batches and a part batch.
    await waitFor(() => expect(upsertBatches(worker)).toBe(3))
    expect(queries(worker)).toHaveLength(0)

    rerender({ query: parseSearchQuery('rare') })
    // Every 1,000th note has the rare word.
    await waitFor(() => expect(result.current.ids?.size).toBe(Math.ceil(library.length / 1000)))
    expect(result.current.pending).toBe(false)
    expect(queries(worker)).toHaveLength(1)
  })

  it('sends only the changed note after an edit, and finds its new text', async () => {
    const query = parseSearchQuery('quokka')
    const { result, rerender } = renderHook(({ notes }) => useSearchMatches(notes, query, locations, noAttachments, true), { initialProps: { notes: library } })
    const worker = FakeWorker.instances[0]
    await waitFor(() => expect(result.current.ids?.size).toBe(0))
    const before = worker.messages.length

    const edited = library.map((item, index) => (index === 7 ? { ...item, content: 'a quokka', updatedAt: 2 } : item))
    rerender({ notes: edited })
    await waitFor(() => expect(result.current.ids).toEqual(new Set(['n7'])))
    const sync = worker.messages.slice(before).filter((message) => message.type === 'sync')
    expect(sync).toEqual([{ type: 'sync', upserts: [expect.objectContaining({ id: 'n7', content: 'a quokka' })], removals: [] }])
  })

  it('sends a note again when it gains an attachment, so has:attachment finds it', async () => {
    const query = parseSearchQuery('has:attachment')
    const { result, rerender } = renderHook(({ attached }) => useSearchMatches(library, query, locations, attached, true), { initialProps: { attached: noAttachments } })
    const worker = FakeWorker.instances[0]
    await waitFor(() => expect(result.current.ids?.size).toBe(0))
    const before = worker.messages.length

    rerender({ attached: new Set(['n3']) })
    await waitFor(() => expect(result.current.ids).toEqual(new Set(['n3'])))
    const sync = worker.messages.slice(before).filter((message) => message.type === 'sync')
    expect(sync).toEqual([{ type: 'sync', upserts: [expect.objectContaining({ id: 'n3', attached: true })], removals: [] }])
  })

  it('shows only the newest query’s answer, even when an older one arrives later', async () => {
    const small = library.slice(0, 10)
    const { result, rerender } = renderHook(({ query }) => useSearchMatches(small, query, locations, noAttachments, true), { initialProps: { query: parseSearchQuery('rare') } })
    const worker = FakeWorker.instances[0]
    await waitFor(() => expect(result.current.ids?.size).toBe(1))
    worker.hold = true
    rerender({ query: parseSearchQuery('plain') })
    rerender({ query: parseSearchQuery('zebra') })
    expect(result.current.pending).toBe(true)
    const [olderAnswer, newerAnswer] = worker.held
    act(() => newerAnswer())
    act(() => olderAnswer())
    expect(result.current.ids?.size).toBe(0)
    expect(result.current.pending).toBe(false)
  })

  it('does nothing when disabled, and reports no worker when Workers are missing', () => {
    renderHook(() => useSearchMatches(library, parseSearchQuery('rare'), locations, noAttachments, false))
    expect(FakeWorker.instances).toHaveLength(0)
    vi.stubGlobal('Worker', undefined)
    const { result } = renderHook(() => useSearchMatches(library, parseSearchQuery('rare'), locations, noAttachments, true))
    expect(result.current.available).toBe(false)
  })
})
