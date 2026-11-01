import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import { notebookForNewNote, shelfForNewNotebook } from '../features/library/placement'
import type { Notebook, Shelf } from '../types'

const shelves: Shelf[] = [
  { id: 'starter-shelf', libraryId: 'starter-library', name: 'General', createdAt: 1, updatedAt: 1 },
  { id: 'garden-shelf', libraryId: 'garden-library', name: 'Beds', createdAt: 2, updatedAt: 2 },
]
const notebooks: Notebook[] = [
  { id: 'starter-personal', name: 'Personal', shelfId: 'starter-shelf', createdAt: 1, updatedAt: 1 },
  { id: 'seed-journal', name: 'Seed journal', shelfId: 'garden-shelf', createdAt: 2, updatedAt: 2 },
]

describe('placement of new notes and notebooks', () => {
  it('puts a new note in the notebook, shelf, or library being viewed', () => {
    expect(notebookForNewNote('notebook:seed-journal', notebooks, shelves)).toBe('seed-journal')
    expect(notebookForNewNote('shelf:garden-shelf', notebooks, shelves)).toBe('seed-journal')
    expect(notebookForNewNote('library:garden-library', notebooks, shelves)).toBe('seed-journal')
    expect(notebookForNewNote('all', notebooks, shelves)).toBe('starter-personal')
  })

  it('falls back to an existing notebook when the starter library is gone', () => {
    const remaining = [notebooks[1]]
    expect(notebookForNewNote('all', remaining, [shelves[1]])).toBe('seed-journal')
    expect(notebookForNewNote('all', [], shelves)).toBeUndefined()
  })

  it('puts a new notebook on the shelf of the current view', () => {
    expect(shelfForNewNotebook('shelf:garden-shelf', notebooks, shelves)).toBe('garden-shelf')
    expect(shelfForNewNotebook('notebook:seed-journal', notebooks, shelves)).toBe('garden-shelf')
    expect(shelfForNewNotebook('library:garden-library', notebooks, shelves)).toBe('garden-shelf')
    expect(shelfForNewNotebook('favorites', notebooks, shelves)).toBe('starter-shelf')
  })
})

describe('stores', () => {
  beforeEach(async () => {
    await deleteDB('my-notes')
    vi.resetModules()
  })

  afterEach(async () => {
    const storage = await import('../lib/notes')
    ;(await storage.openNotesDatabase()).close()
    await deleteDB('my-notes')
    Reflect.deleteProperty(navigator, 'storage')
  })

  it('closes the navigation drawer when the layout stops being compact', async () => {
    const { useWorkspaceStore } = await import('./workspaceStore')
    const workspace = useWorkspaceStore.getState()
    workspace.setCompactNavigation(true)
    workspace.setNavigationOpen(true)
    expect(useWorkspaceStore.getState().navigationOpen).toBe(true)
    workspace.setCompactNavigation(false)
    expect(useWorkspaceStore.getState()).toEqual(expect.objectContaining({ isCompactNavigation: false, navigationOpen: false }))
  })

  it('closes the editor with a notice when the open note was deleted in another tab', async () => {
    const { useEditorStore } = await import('./editorStore')
    const { useWorkspaceStore } = await import('./workspaceStore')
    useEditorStore.getState().open({ id: 'gone', title: 'Gone', content: '', createdAt: 1, updatedAt: 1 })
    useEditorStore.getState().markChangedElsewhere()
    await useEditorStore.getState().loadLatest()
    expect(useEditorStore.getState()).toEqual(expect.objectContaining({ activeNote: null, changedElsewhere: false }))
    expect(useWorkspaceStore.getState().notice).toMatch(/permanently deleted in another tab/)
  })

  it('reloads the open note and remounts the editor when it changed elsewhere', async () => {
    const storage = await import('../lib/notes')
    const { useEditorStore } = await import('./editorStore')
    const note = { id: 'shared', title: 'Shared', content: 'old', createdAt: 1, updatedAt: 1, notebookId: 'starter-personal' }
    await storage.saveNote(note)
    useEditorStore.getState().open(note)
    await storage.saveNote({ ...note, content: 'new', updatedAt: 2 })
    await useEditorStore.getState().loadLatest()
    expect(useEditorStore.getState().activeNote?.content).toBe('new')
    expect(useEditorStore.getState().revision).toBe(1)
  })

  it('asks for persistent storage at most once per session after saves', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: vi.fn().mockResolvedValue(false), persist },
    })
    const { usePersistenceStore } = await import('./persistenceStore')
    await usePersistenceStore.getState().load()
    usePersistenceStore.getState().requestAfterSave()
    usePersistenceStore.getState().requestAfterSave()
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce())
    expect(usePersistenceStore.getState()).toEqual(expect.objectContaining({ status: 'best-effort', requested: true }))
  })
})
