import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../../types'
import { CommandPalette } from './CommandPalette'
import type { PaletteHandlers, PaletteSources } from './paletteItems'

const note = (id: string, title: string, updatedAt: number, notebookId = 'work'): Note =>
  ({ id, title, content: '', createdAt: 1, updatedAt, notebookId })

const sources: PaletteSources = {
  notes: [note('a', 'Weekly plan', 3), note('b', 'Garden plan', 9), note('c', '', 1)],
  libraries: [{ id: 'lib', name: 'Personal Library', createdAt: 1, updatedAt: 1 }],
  shelves: [{ id: 'gen', libraryId: 'lib', name: 'General', createdAt: 1, updatedAt: 1 }],
  notebooks: [{ id: 'work', name: 'Work', shelfId: 'gen', createdAt: 1, updatedAt: 1 }],
  tags: [{ id: 'health', label: 'health', count: 2 }],
  savedSearches: [{ id: 's1', name: 'Open tasks', query: 'has:task -tag:someday' }],
  theme: 'system',
  sidebarCollapsed: false,
}

function setup() {
  const handlers: PaletteHandlers = {
    newNote: vi.fn(), openSettings: vi.fn(), setTheme: vi.fn(), toggleSidebar: vi.fn(), goTo: vi.fn(), openNote: vi.fn(),
    openToday: vi.fn(), newFromTemplate: vi.fn(), createTemplate: vi.fn(), quickCapture: vi.fn(), runSearch: vi.fn(),
  }
  const onClose = vi.fn()
  const onRun = vi.fn((item: { run: () => void }) => item.run())
  render(<CommandPalette sources={sources} handlers={handlers} onClose={onClose} onRun={onRun} />)
  return { handlers, onClose, user: userEvent.setup() }
}

const options = () => within(screen.getByRole('listbox', { name: 'Results' })).getAllByRole('option')

describe('CommandPalette', () => {
  afterEach(cleanup)

  it('opens focused on its input, listing actions and then the newest notes', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Search notes, places, and actions' })).toHaveFocus()
    expect(options().map((option) => option.textContent)).toEqual([
      'New noteAction',
      'Quick noteAction',
      'Open today’s noteAction',
      'Open settingsAction',
      'Create a templateAction',
      'Use light themeAction',
      'Use soft paper themeAction',
      'Use dark themeAction',
      'Collapse sidebarAction',
      'Garden plan — WorkNote',
      'Weekly plan — WorkNote',
      'Untitled note — WorkNote',
    ])
    expect(screen.getByText('Recent notes')).toBeInTheDocument()
  })

  it('finds saved searches by name and runs them', async () => {
    const { handlers, user } = setup()
    await user.type(screen.getByRole('combobox'), 'open tasks')
    expect(options()[0]).toHaveTextContent('Open tasks — Saved searchGo to')
    await user.keyboard('{Enter}')
    expect(handlers.runSearch).toHaveBeenCalledWith('has:task -tag:someday')
  })

  it('filters as you type, moves with the arrow keys (wrapping), and opens the chosen note with Enter', async () => {
    const { handlers, user } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'plan')
    expect(options().map((option) => option.textContent)).toEqual(['Weekly plan — WorkNote', 'Garden plan — WorkNote'])
    expect(input).toHaveAttribute('aria-activedescendant', options()[0].id)
    expect(screen.getByRole('status')).toHaveTextContent('2 results')

    await user.keyboard('{ArrowUp}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(handlers.openNote).toHaveBeenCalledWith(sources.notes[1])
  })

  it('finds places, tags, and actions by keyword', async () => {
    const { handlers, user } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'general')
    expect(options()[0]).toHaveTextContent('General — Shelf in Personal Library')
    await user.keyboard('{Enter}')
    expect(handlers.goTo).toHaveBeenCalledWith('shelf:gen')

    await user.clear(input)
    await user.type(input, 'night')
    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0)
    await user.clear(input)
    await user.type(input, 'appearance dark')
    await user.keyboard('{Enter}')
    expect(handlers.setTheme).toHaveBeenCalledWith('dark')

    await user.clear(input)
    await user.type(input, '#health')
    await user.click(options()[0])
    expect(handlers.goTo).toHaveBeenLastCalledWith('tag:health')
  })

  it('says when nothing matches, and closes on Escape or a click outside', async () => {
    const { onClose, user } = setup()
    await user.type(screen.getByRole('combobox'), 'zebra')
    expect(screen.getByText('No matches. Try another word.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    await user.click(document.querySelector('.palette-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
