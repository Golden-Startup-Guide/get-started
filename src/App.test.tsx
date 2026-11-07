import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import type { Note } from './types'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'
import { getMarkdown, setMarkdown } from './test/markdownEditor'

describe('Knowledge Library workspace', () => {
  // The editor is lazy-loaded. Compiling it the first time takes longer than a query waits, so
  // compile it once here; each test still loads it fresh after vi.resetModules().
  beforeAll(async () => {
    await import('./features/notes/NoteEditor')
  })

  beforeEach(async () => {
    await deleteDB('my-notes')
    vi.resetModules()
    // These tests start on All Notes; Home has its own tests.
    window.history.replaceState(null, '', '/#/notes')
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
    // A second notebook to move a note into; a new library has only "Personal".
    fireEvent.change(screen.getByRole('textbox', { name: 'New notebook name' }), { target: { value: 'Work' } })
    await user.click(screen.getByRole('button', { name: 'Add notebook' }))
    await screen.findByRole('heading', { name: 'Work', level: 1 })
    await user.click(screen.getByRole('button', { name: /^All Notes/ }))
    await screen.findByRole('heading', { name: 'All Notes' })

    await user.click(screen.getByRole('button', { name: 'Create a new note' }))
    const title = await screen.findByRole('textbox', { name: 'Note title' })
    const content = screen.getByRole('textbox', { name: 'Note text' })
    fireEvent.change(title, { target: { value: 'Garden notes' } })
    setMarkdown('**Water** the seedlings', content)
    expect(screen.getByText('Preview')).toBeInTheDocument()
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
    const markdownInput = screen.getByRole('textbox', { name: 'Note text' })
    setMarkdown('**Water** the seedlings\n\n[unsafe](javascript:alert(1))\n\n<script>bad()</script>', markdownInput)
    setMarkdown('**Water** the seedlings and vegetables\n\n- [ ] Water plants\n- [x] Remove weeds\n\n[unsafe](javascript:alert(1))\n\n[Guide](https://example.com/garden) with a note[^1]\n\n[^1]: Footnote\n\n<script>bad()</script>', markdownInput)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('a[href^="#user-content-fn"]')).not.toHaveAttribute('target')
    expect(screen.getByRole('progressbar', { name: 'Checklist progress' })).toHaveTextContent('1 of 2 complete')
    await user.click(screen.getByRole('checkbox', { name: 'Mark task Water plants complete' }))
    expect(screen.getByRole('progressbar', { name: 'Checklist progress' })).toHaveTextContent('2 of 2 complete')
    expect(getMarkdown(markdownInput)).toContain('- [x] Water plants')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    const tagInput = screen.getByRole('textbox', { name: 'Add tags' })
    fireEvent.change(tagInput, { target: { value: 'Seeds' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    const notebookChoice = screen.getByRole('combobox', { name: 'Notebook' })
    fireEvent.change(notebookChoice, { target: { value: (within(notebookChoice).getByRole('option', { name: 'Work' }) as HTMLOptionElement).value } })
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
    await expect((await import('./lib/notes')).getSettings()).resolves.toEqual({ id: 'preferences', theme: 'dark', paper: false })

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
    await within(libraryNavigation).findByText('My notes')
    await user.click(within(libraryNavigation).getByRole('button', { name: 'My notes 1' }))
    expect(await screen.findByRole('heading', { name: 'My notes', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Shelves' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open shelf General' }))
    expect(await screen.findByRole('heading', { name: 'General', level: 1 })).toBeInTheDocument()

    const main = screen.getByRole('main')
    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    await user.type(within(sidebar).getByRole('textbox', { name: 'New library name' }), 'Garden Library')
    await user.click(within(sidebar).getByRole('button', { name: 'Add library' }))
    await within(libraryNavigation).findByRole('button', { name: 'Garden Library 0' }, { timeout: 3000 })
    const newShelf = within(main).getByRole('textbox', { name: 'New shelf in Garden Library' })
    fireEvent.change(newShelf, { target: { value: 'Garden Shelf' } })
    await user.click(within(main).getByRole('button', { name: 'Add shelf' }))
    expect(await screen.findByRole('heading', { name: 'Garden Shelf' })).toBeInTheDocument()
    const gardenShelf = (await storage.getShelves()).find((item) => item.name === 'Garden Shelf')!
    await user.click(within(libraryNavigation).getByRole('button', { name: 'Actions for Personal' }))
    await user.click(within(screen.getByRole('menu', { name: 'Personal actions' })).getByRole('menuitemradio', { name: 'Garden Library · Garden Shelf' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
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

    // The Personal notebook moved here earlier, bringing its starter welcome note.
    await user.click(within(libraryNavigation).getByRole('button', { name: 'Garden Library 1' }))
    await screen.findByRole('heading', { name: 'Garden Library', level: 1 })
    await user.click(within(main).getByRole('button', { name: 'Open shelf Garden Shelf' }))
    await screen.findByRole('heading', { name: 'Garden Shelf', level: 1 })
    await user.click(within(main).getByRole('button', { name: 'Delete shelf' }))
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

  it('previews long notes once typing pauses, with checklists read-only meanwhile', async () => {
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })
    await user.click(screen.getByRole('button', { name: 'Create a new note' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Note title' }), { target: { value: 'Long note' } })
    // Long enough for the paused preview, as one paragraph: 1,100 paragraphs made jsdom take
    // 2–5 s to render the catch-up, which is about jsdom, not the behaviour under test.
    const filler = `${'Plain words that make this a long note. '.repeat(1300)}\n\n`
    setMarkdown(`${filler}- [ ] Final task`)

    expect(screen.getByText('Long note: the preview updates when you pause typing')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Final task/ })).not.toBeInTheDocument()

    const task = await screen.findByRole('checkbox', { name: 'Mark task Final task complete' }, { timeout: 3000 })
    expect(screen.queryByText('Long note: the preview updates when you pause typing')).not.toBeInTheDocument()
    expect(task).toBeEnabled()
    await user.click(task)
    expect(getMarkdown().endsWith('- [x] Final task')).toBe(true)
  }, 15000)

  it('collapses the desktop sidebar and expands library tree sections accessibly', async () => {
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    const libraryNavigation = within(sidebar).getByRole('navigation', { name: 'Libraries' })
    await within(libraryNavigation).findByRole('button', { name: 'My notes 1' })
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    const collapseLibrary = within(sidebar).getByRole('button', { name: 'Collapse My notes' })
    const libraryContentsId = collapseLibrary.getAttribute('aria-controls')!
    await user.click(collapseLibrary)
    expect(within(sidebar).getByRole('button', { name: 'Expand My notes' })).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(libraryContentsId)).toHaveAttribute('hidden')
    expect(within(sidebar).queryByRole('button', { name: 'General 1' })).not.toBeInTheDocument()
    await user.click(within(sidebar).getByRole('button', { name: 'Expand My notes' }))
    expect(await within(sidebar).findByRole('button', { name: 'General 1' })).toBeInTheDocument()

    // The sidebar collapses itself; the header then offers the way back, and focus follows.
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    const expand = await screen.findByRole('button', { name: 'Expand sidebar' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(expand).toHaveFocus())
    await user.click(expand)
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveFocus())
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
      fireEvent.change(await screen.findByRole('textbox', { name: 'Note title' }), { target: { value: 'Keep me' } })
      await waitFor(() => expect(persist).toHaveBeenCalledOnce(), { timeout: 3000 })
      setMarkdown('More text')
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
      fireEvent.change(await screen.findByRole('textbox', { name: 'Note title' }), { target: { value: 'Shared note' } })
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
      const id = (await storage.getNotes()).find((note) => note.title === 'Shared note')!.id

      const editInOtherTab = async (content: string) => {
        const db = await storage.openNotesDatabase()
        await db.put('notes', { ...(await db.get('notes', id))!, content, updatedAt: Date.now() })
        otherTab.postMessage({ type: 'changed', noteIds: [id] })
      }

      await editInOtherTab('Written in the other tab')
      await waitFor(() => expect(getMarkdown()).toBe('Written in the other tab'))

      setMarkdown('My local draft')
      await editInOtherTab('Second edit elsewhere')
      expect(await screen.findByText(/changed in another tab/)).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect((await storage.getNote(id))?.content).toBe('Second edit elsewhere')

      await user.click(screen.getByRole('button', { name: 'Keep my version' }))
      await waitFor(async () => expect((await storage.getNote(id))?.content).toBe('My local draft'), { timeout: 3000 })

      setMarkdown('Another local draft')
      await editInOtherTab('Third edit elsewhere')
      await user.click(await screen.findByRole('button', { name: 'Load the other version' }))
      await waitFor(() => expect(getMarkdown()).toBe('Third edit elsewhere'))
      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect((await storage.getNote(id))?.content).toBe('Third edit elsewhere')
    } finally {
      otherTab.close()
    }
  }, 20000)

  it('opens a keyboard-accessible navigation drawer on compact screens', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 1199px)',
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

    const openButton = () => screen.getByRole('button', { name: 'Open navigation' })
    expect(openButton()).toHaveAttribute('aria-expanded', 'false')
    await user.click(openButton())
    const drawer = await screen.findByRole('dialog', { name: 'Primary navigation' })
    // While the drawer is open its own button closes it; the header button steps aside.
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument()
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Close navigation' })).toHaveFocus())

    // Escape from inside the drawer closes it and returns focus to the header button.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Primary navigation' })).not.toBeInTheDocument()
    await waitFor(() => expect(openButton()).toHaveFocus())

    // Escape also works when focus has left the drawer.
    await user.click(openButton())
    await screen.findByRole('dialog', { name: 'Primary navigation' })
    ;(document.activeElement as HTMLElement | null)?.blur()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Primary navigation' })).not.toBeInTheDocument()

    // The drawer's own button closes it too.
    await user.click(openButton())
    const drawerAgain = await screen.findByRole('dialog', { name: 'Primary navigation' })
    await user.click(within(drawerAgain).getByRole('button', { name: 'Close navigation' }))
    expect(screen.queryByRole('dialog', { name: 'Primary navigation' })).not.toBeInTheDocument()
    await waitFor(() => expect(openButton()).toHaveFocus())

    await user.click(openButton())
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

    // The starter notes are newer, so find this note by searching, as a user would.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes, libraries, shelves, notebooks, and tags' }), { target: { value: 'Source note' } })
    await user.click(await screen.findByRole('button', { name: 'Open note Source note' }))
    const dialog = await screen.findByRole('dialog')
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
    await user.click(screen.getByRole('button', { name: /^Note map/ }))

    expect(await screen.findByRole('heading', { name: 'Note map', level: 1 })).toBeInTheDocument()
    // The graph opens on the newest note, which is now a starter note.
    // The note map's code loads after start-up.
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Explore note' }), 'graph-source')
    expect(screen.getByRole('group', { name: 'Connected note graph' })).toBeInTheDocument()
    const graph = screen.getByRole('group', { name: 'Connected note graph' })
    expect(within(graph).getByRole('button', { name: 'Explore Graph target — Personal' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Links from this note' })).toHaveTextContent('Graph target')

    const connectedNode = within(graph).getByRole('button', { name: 'Explore Graph target — Personal' })
    connectedNode.focus()
    expect(connectedNode).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('combobox', { name: 'Explore note' })).toHaveValue('graph-target')
    await user.click(screen.getByRole('button', { name: 'Open note' }))
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Graph target')
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
      fireEvent.change(await screen.findByRole('textbox', { name: 'Note title' }), { target: { value: 'Photo note' } })
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
    fireEvent.change(await screen.findByRole('textbox', { name: 'Note title' }), { target: { value: 'Delete race' } })
    setMarkdown('saved version')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'), { timeout: 3000 })
    await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])
    await user.click(await screen.findByRole('button', { name: 'Open note Delete race' }))
    setMarkdown('unsaved draft')
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }))
    expect(confirmation).toHaveBeenCalledOnce()
    const { getNotes, getTrash } = await import('./lib/notes')
    await waitFor(async () => expect((await getNotes()).map((note) => note.title)).not.toContain('Delete race'), { timeout: 5000 })
    await waitFor(
      () => expect(screen.queryByRole('heading', { name: 'Delete race' })).not.toBeInTheDocument(),
      { timeout: 5000 },
    )
    expect(await getTrash()).toEqual([expect.objectContaining({ title: 'Delete race', content: 'unsaved draft' })])

    await user.click(within(screen.getByRole('navigation', { name: 'Note views' })).getByRole('button', { name: /Trash/ }))
    const trashCard = (await screen.findByRole('heading', { name: 'Delete race' })).closest('article')
    expect(trashCard).not.toBeNull()
    await user.click(within(trashCard!).getByRole('button', { name: 'Restore' }))
    expect(await getNotes()).toContainEqual(expect.objectContaining({ title: 'Delete race' }))

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
  it('does not let a late focus restore pull focus out of a dialog opened meanwhile', async () => {
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })
    await user.click(await screen.findByRole('button', { name: /^Open note Welcome to your Knowledge Library/ }))
    await screen.findByRole('textbox', { name: 'Note title' })

    // Hold back the frame in which closing the editor restores focus, as a slow browser might.
    const frames: FrameRequestCallback[] = []
    const realFrame = window.requestAnimationFrame
    window.requestAnimationFrame = (callback) => frames.push(callback)
    try {
      await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])
      await user.keyboard('{Control>}k{/Control}')
      const input = await screen.findByRole('combobox', { name: 'Search notes, places, and actions' })
      expect(input).toHaveFocus()
      for (const frame of frames.splice(0)) frame(performance.now())
      expect(input).toHaveFocus()
    } finally {
      window.requestAnimationFrame = realFrame
    }
  })

  it('saves a search by name, runs it from the sidebar, and removes it', async () => {
    const { default: App } = await import('./App')
    const storage = await import('./lib/notes')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })
    const search = screen.getByRole('searchbox')
    expect(screen.queryByRole('button', { name: 'Save this search' })).not.toBeInTheDocument()

    await user.type(search, 'has:task  -tag:someday')
    await user.click(screen.getByRole('button', { name: 'Save this search' }))
    const name = screen.getByRole('textbox', { name: 'Name this search' })
    expect(name).toHaveValue('has:task  -tag:someday')
    await user.clear(name)
    await user.type(name, 'Open tasks{Enter}')
    expect(await screen.findByRole('button', { name: 'Remove saved search “Open tasks”' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Saved the search “Open tasks”.')
    await expect(storage.getSettings()).resolves.toEqual(expect.objectContaining({
      savedSearches: [expect.objectContaining({ name: 'Open tasks', query: 'has:task  -tag:someday' })],
    }))

    // The same search with different spacing counts as saved.
    await user.clear(search)
    await user.type(search, 'has:task -tag:someday ')
    expect(screen.getByRole('button', { name: 'Remove saved search “Open tasks”' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await user.click(screen.getByRole('button', { name: /Favorites/ }))
    const saved = within(screen.getByRole('navigation', { name: 'Saved searches' })).getByRole('button', { name: 'Open tasks' })
    expect(saved).not.toHaveAttribute('aria-current')
    await user.click(saved)
    expect(await screen.findByRole('heading', { name: 'All Notes' })).toBeInTheDocument()
    expect(search).toHaveValue('has:task  -tag:someday')
    expect(saved).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: 'Remove saved search “Open tasks”' }))
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Saved searches' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Save this search' })).toBeInTheDocument()
    await expect(storage.getSettings()).resolves.toEqual(expect.objectContaining({ savedSearches: [] }))
  }, 15000)

  it('keeps a large library closed in the sidebar, but opens the branch of the page shown', async () => {
    const storage = await import('./lib/notes')
    await storage.getNotes()
    for (let index = 1; index <= 9; index += 1) await storage.createNotebook(`Topic ${index}`)
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'All Notes' })
    const libraries = screen.getByRole('navigation', { name: 'Libraries' })
    // Ten notebooks: closed by default, and its shelves are not drawn at all.
    expect(await within(libraries).findByRole('button', { name: 'Expand My notes' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(libraries).queryByRole('button', { name: /^General/ })).not.toBeInTheDocument()
    // Handbook libraries are small, so they start open.
    expect(within(screen.getByRole('navigation', { name: 'Handbooks' })).getByRole('button', { name: /^Everyday Nutrition/ })).toBeInTheDocument()

    // Showing a notebook opens its branch; the reader can still close it.
    const notebook = (await storage.getNotebooks()).find((item) => item.name === 'Topic 4')!
    window.history.pushState(null, '', `/#/notebook/${notebook.id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await within(libraries).findByRole('button', { name: /^Topic 4/ })).toHaveAttribute('aria-current', 'page')
    await user.click(within(libraries).getByRole('button', { name: 'Collapse My notes' }))
    expect(within(libraries).queryByRole('button', { name: /^Topic 4/ })).not.toBeInTheDocument()
  }, 15000)

  it('opens on Home: an invitation to start, the libraries to explore, and then where to continue', async () => {
    window.history.replaceState(null, '', '/')
    const { default: App } = await import('./App')
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome to your library', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Start reading' })).toBeInTheDocument()
    const libraries = screen.getByRole('region', { name: 'Explore libraries' })
    expect(within(libraries).getByRole('button', { name: /^Health & Wellbeing/ })).toBeInTheDocument()
    // Home is drawn before the library loads; personal libraries join the tiles once it has.
    expect(await within(libraries).findByRole('button', { name: /^My notes/ })).toBeInTheDocument()

    // Recently added lists the Welcome note and the handbooks; opening one is remembered.
    const recent = await screen.findByRole('region', { name: 'Recently added' })
    await user.click(within(recent).getByRole('button', { name: /^Welcome to your Knowledge Library/ }))
    await screen.findByRole('textbox', { name: 'Note title' })
    await user.click(screen.getAllByRole('button', { name: 'Close editor' })[1])
    const resume = await screen.findByRole('region', { name: 'Continue reading' })
    expect(within(resume).getByText('Welcome to your Knowledge Library', { selector: 'p' })).toBeInTheDocument()
    expect(within(resume).getByRole('button', { name: 'Continue reading Welcome to your Knowledge Library' })).toBeInTheDocument()
    expect(within(resume).getByText('My notes / General / Personal')).toBeInTheDocument()

    await user.click(within(libraries).getByRole('button', { name: /^Health & Wellbeing/ }))
    expect(await screen.findByRole('heading', { name: 'Health & Wellbeing', level: 1 })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/library/core-health-and-wellbeing')
  }, 15000)
})
