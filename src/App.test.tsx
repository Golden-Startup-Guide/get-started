import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'

describe('My Notes workspace', () => {
  beforeEach(async () => {
    await deleteDB('my-notes')
    vi.resetModules()
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    vi.stubGlobal('crypto', { ...crypto, randomUUID: () => `test-${Math.random().toString(16).slice(2)}` })
  })

  afterEach(async () => {
    cleanup()
    const { default: App } = await import('./App')
    void App
    const storage = await import('./lib/notes')
    const db = await storage.openNotesDatabase()
    db.close()
    await deleteDB('my-notes')
    vi.unstubAllGlobals()
  })

  it('creates and autosaves notes, searches, favorites, and preserves the theme choice', async () => {
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })

    await user.click(screen.getByRole('button', { name: 'Create a new note' }))
    const title = screen.getByRole('textbox', { name: 'Note title' })
    const content = screen.getByRole('textbox', { name: 'Markdown' })
    fireEvent.change(title, { target: { value: 'Garden notes' } })
    fireEvent.change(content, { target: { value: '**Water** the seedlings' } })
    expect(screen.getByText('Live preview')).toBeInTheDocument()
    expect(screen.getByText('Water', { selector: 'strong' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])

    const note = await screen.findByRole('heading', { name: 'Garden notes' })
    expect(note).toBeInTheDocument()
    const card = note.closest('article')
    expect(card).not.toBeNull()
    await user.click(within(card!).getByRole('button', { name: 'Add to favorites' }))
    await user.click(within(card!).getByRole('button', { name: 'Pin note' }))
    expect(await within(card!).findByText('Pinned')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Favorites/ }))
    expect(await screen.findByRole('heading', { name: 'Garden notes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open note Garden notes' }))
    const markdownInput = screen.getByRole('textbox', { name: 'Markdown' })
    fireEvent.change(markdownInput, { target: { value: '**Water** the seedlings\n\n[unsafe](javascript:alert(1))\n\n<script>bad()</script>' } })
    fireEvent.change(markdownInput, { target: { value: '**Water** the seedlings and vegetables\n\n[unsafe](javascript:alert(1))\n\n<script>bad()</script>' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
    const tagInput = screen.getByRole('textbox', { name: 'Add tags' })
    fireEvent.change(tagInput, { target: { value: 'Seeds' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Notebook' }), { target: { value: 'starter-work' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])
    await screen.findByRole('heading', { name: 'Garden notes' })
    await expect((await import('./lib/notes')).getNoteHistory((await (await import('./lib/notes')).getNotes()).find((note) => note.title === 'Garden notes')!.id)).resolves.toHaveLength(1)
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter notes' }), { target: { value: 'tag:seeds' } })
    expect(await screen.findByRole('heading', { name: 'Garden notes' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Open settings' })[0])
    await user.click(screen.getByRole('radio', { name: /dark/i }))
    expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Close settings' }))
    await expect((await import('./lib/notes')).getSettings()).resolves.toEqual({ id: 'preferences', theme: 'dark' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes, notebooks, and tags' }), { target: { value: 'Work' } })
    expect(await screen.findByText('Work', { selector: 'mark' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes, notebooks, and tags' }), { target: { value: 'seedlings' } })
    expect(await screen.findByRole('heading', { name: 'Garden notes' })).toBeInTheDocument()
    expect(screen.getByText('seedlings', { selector: 'mark' })).toBeInTheDocument()
  }, 15000)

  it('does not recreate a note when deleting with an unsaved draft', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })

    await user.click(screen.getByRole('button', { name: 'Create a new note' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), { target: { value: 'Delete race' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), { target: { value: 'saved version' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])
    await user.click(await screen.findByRole('button', { name: 'Open note Delete race' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), { target: { value: 'unsaved draft' } })
    await user.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Delete race' })).not.toBeInTheDocument())
    const { getNotes } = await import('./lib/notes')
    expect(await getNotes()).toEqual([])
  }, 15000)
})
