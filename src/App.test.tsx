import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import type { Note } from './types'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'

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
    fireEvent.change(markdownInput, { target: { value: '**Water** the seedlings and vegetables\n\n- [ ] Water plants\n- [x] Remove weeds\n\n[unsafe](javascript:alert(1))\n\n[Guide](https://example.com/garden) with a note[^1]\n\n[^1]: Footnote\n\n<script>bad()</script>' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('a[href^="#user-content-fn"]')).not.toHaveAttribute('target')
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
    // Edits seconds apart form one editing burst, so they share a single revision.
    await expect((await import('./lib/notes')).getNoteHistory((await (await import('./lib/notes')).getNotes()).find((note) => note.title === 'Garden notes')!.id)).resolves.toHaveLength(1)
    expect((await (await import('./lib/notes')).getNotes()).find((note) => note.title === 'Garden notes')?.content).toContain('- [x] Water plants')
    await user.click(within(screen.getByRole('navigation', { name: 'Tags' })).getByRole('button', { name: 'Seeds 1' }))
    expect(await screen.findByRole('heading', { name: 'Garden notes' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Open settings' })[0])
    await user.click(screen.getByRole('radio', { name: /dark/i }))
    expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Close settings' }))
    await expect((await import('./lib/notes')).getSettings()).resolves.toEqual({ id: 'preferences', theme: 'dark' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes, libraries, shelves, notebooks, and tags' }), { target: { value: 'Work' } })
    expect(await screen.findByText('Work', { selector: 'mark' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes, libraries, shelves, notebooks, and tags' }), { target: { value: 'seedlings' } })
    expect(await screen.findByRole('heading', { name: 'Garden notes' })).toBeInTheDocument()
    expect(screen.getByText('seedlings', { selector: 'mark' })).toBeInTheDocument()
  }, 25000)

  it('navigates library and shelf pages and moves notebooks before deleting a shelf', async () => {
    const storage = await import('./lib/notes')
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })

    const libraryNavigation = screen.getByRole('navigation', { name: 'Libraries' })
    await within(libraryNavigation).findByText('Personal Library')
    await user.click(within(libraryNavigation).getByRole('button', { name: 'Personal Library 0' }))
    expect(await screen.findByRole('heading', { name: 'Library home' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open General shelf' }))
    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument()

    await user.click(within(libraryNavigation).getByRole('button', { name: 'Personal Library 0' }))
    await screen.findByRole('heading', { name: 'Library home' })
    const main = screen.getByRole('main')
    await user.type(within(main).getByRole('textbox', { name: 'New library name' }), 'Garden Library')
    await user.click(within(main).getByRole('button', { name: 'Add library' }))
    await within(libraryNavigation).findByRole('button', { name: 'Garden Library 0' }, { timeout: 3000 })
    const newShelf = within(main).getByRole('textbox', { name: 'New shelf in Garden Library' })
    fireEvent.change(newShelf, { target: { value: 'Garden Shelf' } })
    await user.click(within(main).getByRole('button', { name: 'Add shelf' }))
    expect(await screen.findByRole('heading', { name: 'Garden Shelf' })).toBeInTheDocument()
    const gardenShelf = (await storage.getShelves()).find((item) => item.name === 'Garden Shelf')!
    await user.selectOptions(within(libraryNavigation).getByRole('combobox', { name: 'Move Personal to shelf' }), gardenShelf.id)
    await waitFor(async () => expect(await storage.getNotebooks()).toContainEqual(
      expect.objectContaining({ id: 'starter-personal', shelfId: gardenShelf.id }),
    ))

    fireEvent.change(within(main).getByRole('textbox', { name: 'New notebook in Garden Shelf' }), { target: { value: 'Seed Journal' } })
    await user.click(within(main).getByRole('button', { name: 'Add notebook' }))
    await waitFor(async () => expect(await storage.getNotebooks()).toContainEqual(
      expect.objectContaining({ name: 'Seed Journal', shelfId: expect.any(String) }),
    ))
    const notebook = (await storage.getNotebooks()).find((item) => item.name === 'Seed Journal')!
    const note: Note = {
      id: 'shelf-delete-note',
      title: 'Garden observations',
      content: 'Preserve during shelf deletion.',
      createdAt: 1,
      updatedAt: 2,
      notebookId: notebook.id,
    }
    await storage.saveNote(note)

    await user.click(within(libraryNavigation).getByRole('button', { name: 'Garden Library 0' }))
    await screen.findByRole('heading', { name: 'Library home' })
    await user.click(within(main).getByRole('button', { name: 'Delete Garden Shelf' }))
    const dialog = screen.getByRole('dialog')
    const gardenLibrary = (await storage.getLibraries()).find((item) => item.name === 'Garden Library')!
    const destinationShelf = (await storage.getShelves()).find((item) => item.libraryId === gardenLibrary.id && item.name === 'General')!
    await user.selectOptions(within(dialog).getByLabelText('Move notebooks to shelf'), destinationShelf.id)
    await user.click(within(dialog).getByRole('button', { name: 'Move contents and delete' }))
    await waitFor(async () => expect(await storage.getShelves()).not.toContainEqual(
      expect.objectContaining({ name: 'Garden Shelf' }),
    ))
    expect(await storage.getNotebooks()).toContainEqual(expect.objectContaining({ id: notebook.id, shelfId: destinationShelf.id }))
    expect(await storage.getNotes()).toContainEqual(expect.objectContaining(note))
  }, 15000)

  it('collapses the desktop sidebar and expands library tree sections accessibly', async () => {
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    const libraryNavigation = within(sidebar).getByRole('navigation', { name: 'Libraries' })
    await within(libraryNavigation).findByRole('button', { name: 'Personal Library 0' })
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    const collapseLibrary = within(sidebar).getByRole('button', { name: 'Collapse Personal Library' })
    const libraryContentsId = collapseLibrary.getAttribute('aria-controls')!
    await user.click(collapseLibrary)
    expect(within(sidebar).getByRole('button', { name: 'Expand Personal Library' })).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(libraryContentsId)).toHaveAttribute('hidden')
    expect(within(sidebar).queryByRole('button', { name: 'General 0' })).not.toBeInTheDocument()
    await user.click(within(sidebar).getByRole('button', { name: 'Expand Personal Library' }))
    expect(await within(sidebar).findByRole('button', { name: 'General 0' })).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')
  }, 15000)

  it('asks once for persistent storage after the first save without holding up saves, and lets Settings ask again', async () => {
    // Firefox answers persist() only when the user responds to its permission prompt, so the
    // first request may never settle; saving must not wait for it.
    const persist = vi.fn().mockReturnValueOnce(new Promise<boolean>(() => undefined)).mockResolvedValueOnce(true)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: vi.fn().mockResolvedValue(false), persist },
    })
    try {
      const { default: App } = await import('./App')
      const user = userEvent.setup()
      render(<App />)
      await screen.findByRole('heading', { name: 'All Notes' })
      expect(persist).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Create a new note' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), { target: { value: 'Keep me' } })
      await waitFor(() => expect(persist).toHaveBeenCalledOnce(), { timeout: 3000 })
      fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), { target: { value: 'More text' } })
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
      expect(persist).toHaveBeenCalledOnce()
      const storage = await import('./lib/notes')
      expect((await storage.getNotes()).find((note) => note.title === 'Keep me')?.content).toBe('More text')
      await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])

      await user.click(screen.getAllByRole('button', { name: 'Open settings' })[0])
      expect(await screen.findByText(/Persistent storage is off/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Keep notes on this device' }))
      expect(await screen.findByText(/Persistent storage is on/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Keep notes on this device' })).not.toBeInTheDocument()
      expect(persist).toHaveBeenCalledTimes(2)
    } finally {
      Reflect.deleteProperty(navigator, 'storage')
    }
  }, 15000)

  it('picks up edits from another tab and pauses autosave when both tabs changed a note', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const otherTab = new FakeBroadcastChannel('my-notes-changes')
    try {
      const { default: App } = await import('./App')
      const storage = await import('./lib/notes')
      const user = userEvent.setup()
      render(<App />)
      await screen.findByRole('heading', { name: 'All Notes' })
      await user.click(screen.getByRole('button', { name: 'Create a new note' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), { target: { value: 'Shared note' } })
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
      const id = (await storage.getNotes()).find((note) => note.title === 'Shared note')!.id

      const editInOtherTab = async (content: string) => {
        const db = await storage.openNotesDatabase()
        await db.put('notes', { ...(await db.get('notes', id))!, content, updatedAt: Date.now() })
        otherTab.postMessage({ type: 'changed', noteIds: [id] })
      }

      await editInOtherTab('Written in the other tab')
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue('Written in the other tab'))

      fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), { target: { value: 'My local draft' } })
      await editInOtherTab('Second edit elsewhere')
      expect(await screen.findByText(/changed in another tab/)).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect((await storage.getNote(id))?.content).toBe('Second edit elsewhere')

      await user.click(screen.getByRole('button', { name: 'Keep my version' }))
      await waitFor(async () => expect((await storage.getNote(id))?.content).toBe('My local draft'), { timeout: 3000 })

      fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), { target: { value: 'Another local draft' } })
      await editInOtherTab('Third edit elsewhere')
      await user.click(await screen.findByRole('button', { name: 'Load the other version' }))
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue('Third edit elsewhere'))
      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect((await storage.getNote(id))?.content).toBe('Third edit elsewhere')
    } finally {
      otherTab.close()
    }
  }, 20000)

  it('opens a keyboard-accessible navigation drawer on compact screens', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 1023px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })

    const toggle = screen.getByRole('button', { name: 'Open navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const drawer = await screen.findByRole('dialog', { name: 'Primary navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Close navigation' })).toHaveFocus())

    fireEvent.keyDown(drawer, { key: 'Escape' })
    await waitFor(() => expect(toggle).toHaveFocus())
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    const reopenedDrawer = await screen.findByRole('dialog', { name: 'Primary navigation' })
    await user.click(within(reopenedDrawer).getByRole('button', { name: 'Favorites 0' }))
    expect(await screen.findByRole('heading', { name: 'Favorites' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Primary navigation' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Favorites' })).toHaveFocus())
  }, 15000)

  it('creates, follows, disambiguates, and removes linked notes with backlinks', async () => {
    const storage = await import('./lib/notes')
    await storage.saveNote({
      id: 'source-note-001',
      title: 'Source note',
      content: '',
      createdAt: 1,
      updatedAt: 1,
      notebookId: 'starter-personal',
    })
    await storage.saveNote({
      id: 'a1234567-target',
      title: 'Duplicate title',
      content: '',
      createdAt: 2,
      updatedAt: 2,
      notebookId: 'starter-personal',
    })
    await storage.saveNote({
      id: 'b2345678-target',
      title: 'Duplicate title',
      content: '',
      createdAt: 3,
      updatedAt: 3,
      notebookId: 'starter-personal',
    })
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })

    await user.click(screen.getByRole('button', { name: 'Open note Source note' }))
    const dialog = screen.getByRole('dialog')
    const linkPicker = within(dialog).getByRole('combobox', { name: 'Choose a note to link' })
    await user.type(linkPicker, 'duplicate')
    const matches = within(dialog).getByRole('listbox', { name: 'Notes to link' })
    expect(within(matches).getByRole('option', { name: 'Duplicate title — Personal · 7-target' })).toBeInTheDocument()
    expect(within(matches).getByRole('option', { name: 'Duplicate title — Personal · 8-target' })).toBeInTheDocument()
    expect(within(matches).queryByRole('option', { name: /Source note/ })).not.toBeInTheDocument()
    await user.click(within(matches).getByRole('option', { name: 'Duplicate title — Personal · 7-target' }))
    expect(linkPicker).toHaveValue('Duplicate title — Personal · 7-target')
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }))
    const targetLink = await within(dialog).findByRole('button', { name: 'Duplicate title — Personal · 7-target' })
    await user.click(targetLink)

    // Opening a linked note saves the current draft first, and each editor loads its links
    // from IndexedDB after it opens, so these must wait rather than look once.
    const targetDialog = await screen.findByRole('dialog', { name: 'Duplicate title' })
    const backlink = await within(targetDialog).findByRole('button', { name: 'Source note — Personal' })
    await user.click(backlink)

    const sourceDialog = await screen.findByRole('dialog', { name: 'Source note' })
    await user.click(await within(sourceDialog).findByRole('button', {
      name: 'Remove link to Duplicate title — Personal · 7-target',
    }))
    expect(await within(sourceDialog).findByText('No linked notes yet.')).toBeInTheDocument()
  })

  it('explores stored relationships in the graph and opens the focused note', async () => {
    const storage = await import('./lib/notes')
    await storage.saveNote({
      id: 'graph-source',
      title: 'Graph source',
      content: '',
      createdAt: 1,
      updatedAt: 2,
      notebookId: 'starter-personal',
    })
    await storage.saveNote({
      id: 'graph-target',
      title: 'Graph target',
      content: '',
      createdAt: 1,
      updatedAt: 1,
      notebookId: 'starter-personal',
    })
    await storage.linkNotes('graph-source', 'graph-target')

    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })
    await user.click(screen.getByRole('button', { name: /Knowledge Graph/ }))

    expect(await screen.findByRole('heading', { name: 'Knowledge Graph' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Connected note graph' })).toBeInTheDocument()
    const graph = screen.getByRole('group', { name: 'Connected note graph' })
    expect(within(graph).getByRole('button', { name: 'Explore Graph target — Personal' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Links from this note' })).toHaveTextContent('Graph target')

    const connectedNode = within(graph).getByRole('button', { name: 'Explore Graph target — Personal' })
    connectedNode.focus()
    expect(connectedNode).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('combobox', { name: 'Explore note' })).toHaveValue('graph-target')
    await user.click(screen.getByRole('button', { name: 'Open in editor' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Graph target')
  })

  it('attaches and previews local image files from a saved note', async () => {
    const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const revokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const objectUrlTypes: string[] = []
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob) => {
        objectUrlTypes.push(blob.type)
        return 'blob:test-attachment'
      },
    })
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

      expect(await screen.findByRole('img', { name: 'Preview of seedlings.png' }, { timeout: 5000 })).toHaveAttribute('src', 'blob:test-attachment')
      expect(screen.getByRole('link', { name: 'Download seedlings.png' })).toHaveAttribute('download', 'seedlings.png')
      expect(screen.getByRole('button', { name: 'Record audio' })).toBeDisabled()
      expect(screen.getByText('Audio recording is unavailable here; attach an audio file to play it in the note.')).toBeInTheDocument()
      const audio = new File([new Uint8Array([1, 2, 3])], 'voice.webm', { type: 'audio/webm' })
      await user.upload(screen.getByLabelText('Choose files to attach'), audio)
      await waitFor(() => expect(document.querySelector('audio')).toHaveAttribute('src', 'blob:test-attachment'), { timeout: 5000 })
      const page = new File(['<script>steal()</script>'], 'page.html', { type: 'text/html' })
      await user.upload(screen.getByLabelText('Choose files to attach'), page)
      await screen.findByRole('link', { name: 'Download page.html' }, { timeout: 5000 })
      // Only previewable files keep their type; others cannot render in the app's origin.
      expect(objectUrlTypes).toEqual(expect.arrayContaining(['image/png', 'audio/webm', 'application/octet-stream']))
      expect(objectUrlTypes).not.toContain('text/html')
      await expect((await import('./lib/notes')).getStorageSnapshot()).resolves.toEqual(
        expect.objectContaining({ attachments: 3, attachmentBytes: image.size + audio.size + page.size }),
      )
      await user.click(screen.getByRole('button', { name: 'Remove attachment page.html' }))
      await waitFor(() => expect(screen.queryByRole('link', { name: 'Download page.html' })).not.toBeInTheDocument())

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
  }, 15000)

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
    const { getNotes, getTrash } = await import('./lib/notes')
    await waitFor(async () => expect(await getNotes()).toEqual([]), { timeout: 5000 })
    await waitFor(
      () => expect(screen.queryByRole('heading', { name: 'Delete race' })).not.toBeInTheDocument(),
      { timeout: 5000 },
    )
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
