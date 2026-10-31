import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import { FakeBroadcastChannel } from '../test/fakeBroadcastChannel'
import type { StorageEvent } from './notes'

describe('cross-tab storage events', () => {
  let storage: typeof import('./notes')
  let otherTab: FakeBroadcastChannel
  const received: unknown[] = []

  beforeAll(async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    vi.resetModules()
    storage = await import('./notes')
    otherTab = new FakeBroadcastChannel('my-notes-changes')
    otherTab.addEventListener('message', (event) => received.push((event as MessageEvent).data))
  })

  afterAll(async () => {
    otherTab.close()
    ;(await storage.openNotesDatabase()).close()
    await deleteDB('my-notes')
    vi.unstubAllGlobals()
  })

  it('tells other tabs which notes a write touched', async () => {
    await storage.saveNote({ id: 'shared-note', title: 'Shared', content: '', createdAt: 1, updatedAt: 1, notebookId: 'starter-personal' })
    await storage.trashNote('shared-note')
    await storage.createNotebook('Shared notebook')
    expect(received).toEqual([
      { type: 'changed', noteIds: ['shared-note'] },
      { type: 'changed', noteIds: ['shared-note'] },
      { type: 'changed', noteIds: [] },
    ])
  })

  it('passes changes from other tabs to subscribers and ignores malformed messages', () => {
    const events: StorageEvent[] = []
    const unsubscribe = storage.subscribeToStorage((event) => events.push(event))
    otherTab.postMessage({ type: 'changed', noteIds: ['a', 7, 'b'] })
    otherTab.postMessage({ type: 'something-else' })
    otherTab.postMessage('not an object')
    unsubscribe()
    otherTab.postMessage({ type: 'changed', noteIds: ['after-unsubscribe'] })
    expect(events).toEqual([{ type: 'changed', noteIds: ['a', 'b'] }])
  })
})
