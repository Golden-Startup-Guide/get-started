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
    fireEvent.change(markdownInput, { target: { value: '**Water** the seedlings and vegetables\n\n- [ ] Water plants\n- [x] Remove weeds\n\n[unsafe](javascript:alert(1))\n\n<script>bad()</script>' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Checklist progress' })).toHaveTextContent('1 of 2 complete')
    await user.click(screen.getByRole('checkbox', { name: 'Mark task Water plants complete' }))
    expect(screen.getByRole('progressbar', { name: 'Checklist progress' })).toHaveTextContent('2 of 2 complete')
    expect((markdownInput as HTMLTextAreaElement).value).toContain('- [x] Water plants')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    const tagInput = screen.getByRole('textbox', { name: 'Add tags' })
    fireEvent.change(tagInput, { target: { value: 'Seeds' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Notebook' }), { target: { value: 'starter-work' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])
    await screen.findByRole('heading', { name: 'Garden notes' })
    await expect((await import('./lib/notes')).getNoteHistory((await (await import('./lib/notes')).getNotes()).find((note) => note.title === 'Garden notes')!.id)).resolves.toHaveLength(2)
    expect((await (await import('./lib/notes')).getNotes()).find((note) => note.title === 'Garden notes')?.content).toContain('- [x] Water plants')
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
  }, 25000)

  it('attaches and previews local image files from a saved note', async () => {
    const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const revokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:test-attachment' })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    const view = render(<App />)
    try {
      await screen.findByRole('heading', { name: 'All Notes' })
      await user.click(screen.getByRole('button', { name: 'Create a new note' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), { target: { value: 'Photo note' } })
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
      const image = new File([new Uint8Array([137, 80, 78, 71])], 'seedlings.png', { type: 'image/png' })
      await user.upload(screen.getByLabelText('Choose files to attach'), image)

      expect(await screen.findByRole('img', { name: 'Preview of seedlings.png' })).toHaveAttribute('src', 'blob:test-attachment')
      expect(screen.getByRole('link', { name: 'Download seedlings.png' })).toHaveAttribute('download', 'seedlings.png')
      expect(screen.getByRole('button', { name: 'Record audio' })).toBeDisabled()
      expect(screen.getByText('Audio recording is unavailable here; attach an audio file to play it in the note.')).toBeInTheDocument()
      const audio = new File([new Uint8Array([1, 2, 3])], 'voice.webm', { type: 'audio/webm' })
      await user.upload(screen.getByLabelText('Choose files to attach'), audio)
      await waitFor(() => expect(document.querySelector('audio')).toHaveAttribute('src', 'blob:test-attachment'))
      await expect((await import('./lib/notes')).getStorageSnapshot()).resolves.toEqual(
        expect.objectContaining({ attachments: 2, attachmentBytes: image.size + audio.size }),
      )

      await user.click(screen.getByRole('button', { name: 'Remove attachment seedlings.png' }))
      await waitFor(() => expect(screen.queryByRole('img', { name: 'Preview of seedlings.png' })).not.toBeInTheDocument())
      await user.click(screen.getByRole('button', { name: 'Remove attachment voice.webm' }))
      await waitFor(() => expect(document.querySelector('audio')).toBeNull())
      const storage = await import('./lib/notes')
      const savedNote = (await storage.getNotes()).find((note) => note.title === 'Photo note')
      await expect(storage.getNoteAttachments(savedNote!.id)).resolves.toEqual([])
    } finally {
      view.unmount()
      if (createObjectURL) Object.defineProperty(URL, 'createObjectURL', createObjectURL)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURL)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('does not recreate a note when deleting with an unsaved draft', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true)
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
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }))
    expect(confirmation).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Delete race' })).not.toBeInTheDocument())
    const { getNotes, getTrash } = await import('./lib/notes')
    expect(await getNotes()).toEqual([])
    expect(await getTrash()).toEqual([expect.objectContaining({ title: 'Delete race', content: 'unsaved draft' })])

    await user.click(within(screen.getByRole('navigation', { name: 'Note views' })).getByRole('button', { name: /Trash/ }))
    const trashCard = (await screen.findByRole('heading', { name: 'Delete race' })).closest('article')
    expect(trashCard).not.toBeNull()
    await user.click(within(trashCard!).getByRole('button', { name: 'Restore' }))
    expect(await getNotes()).toEqual([expect.objectContaining({ title: 'Delete race' })])

    await user.click(screen.getByRole('button', { name: /All Notes/ }))
    expect(await screen.findByRole('heading', { name: 'Delete race' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open note Delete race' }))
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(within(screen.getByRole('navigation', { name: 'Note views' })).getByRole('button', { name: /Trash/ }))
    const restoredCard = (await screen.findByRole('heading', { name: 'Delete race' })).closest('article')
    await user.click(within(restoredCard!).getByRole('button', { name: 'Delete forever' }))
    await waitFor(() => expect(getTrash()).resolves.toEqual([]))
  }, 25000)
})
