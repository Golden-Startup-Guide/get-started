import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../../types'
import { MAX_LINK_PICKER_RESULTS, NoteLinkPicker } from './NoteLinkPicker'

function makeNotes(count: number): { notes: Note[]; labels: Map<string, string> } {
  const notes = Array.from({ length: count }, (_, index): Note => ({
    id: `note-${index}`,
    title: index % 2 ? `Garden plan ${index}` : `Budget ${index}`,
    content: '',
    createdAt: index,
    updatedAt: index,
  }))
  const labels = new Map(notes.map((note) => [note.id, `${note.title} — ${note.id.endsWith('7') ? 'Work' : 'Personal'}`]))
  return { notes, labels }
}

function Picker({ notes, labels, onSelect = () => undefined }: { notes: Note[]; labels: Map<string, string>; onSelect?: (id: string) => void }) {
  const [selected, setSelected] = useState('')
  return (
    <>
      <label htmlFor="picker">Choose a note to link</label>
      <NoteLinkPicker
        id="picker"
        targets={notes}
        labels={labels}
        selectedId={selected}
        onSelect={(id) => {
          setSelected(id)
          onSelect(id)
        }}
      />
      <output data-testid="selected">{selected}</output>
    </>
  )
}

describe('NoteLinkPicker', () => {
  afterEach(cleanup)

  it('renders no options until it is used', () => {
    const { notes, labels } = makeNotes(5)
    render(<Picker notes={notes} labels={labels} />)
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Choose a note to link' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows at most 50 matches and says how many more there are', async () => {
    const { notes, labels } = makeNotes(130)
    render(<Picker notes={notes} labels={labels} />)
    await userEvent.type(screen.getByRole('combobox'), 'garden')
    const list = screen.getByRole('listbox', { name: 'Notes to link' })
    expect(within(list).getAllByRole('option')).toHaveLength(MAX_LINK_PICKER_RESULTS)
    expect(list).toHaveTextContent('15 more; keep typing to narrow the list')
  })

  it('matches title or notebook regardless of case', async () => {
    const { notes, labels } = makeNotes(30)
    render(<Picker notes={notes} labels={labels} />)
    await userEvent.type(screen.getByRole('combobox'), 'WORK')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Garden plan 7 — Work',
      'Garden plan 17 — Work',
      'Garden plan 27 — Work',
    ])
    await userEvent.clear(screen.getByRole('combobox'))
    await userEvent.type(screen.getByRole('combobox'), 'nothing like this')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.getByRole('listbox')).toHaveTextContent('No matching notes')
  })

  it('selects with the arrow keys and Enter, and announces the active option', async () => {
    const { notes, labels } = makeNotes(10)
    render(<Picker notes={notes} labels={labels} />)
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'garden')
    await userEvent.keyboard('{ArrowDown}')
    const active = screen.getByRole('option', { selected: true })
    expect(active).toHaveTextContent('Garden plan 3 — Personal')
    expect(input).toHaveAttribute('aria-activedescendant', active.id)
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('selected')).toHaveTextContent('note-3')
    expect(input).toHaveValue('Garden plan 3 — Personal')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('clears the choice when the user types again', async () => {
    const { notes, labels } = makeNotes(10)
    render(<Picker notes={notes} labels={labels} />)
    await userEvent.type(screen.getByRole('combobox'), 'budget 4')
    await userEvent.click(screen.getByRole('option', { name: 'Budget 4 — Personal' }))
    expect(screen.getByTestId('selected')).toHaveTextContent('note-4')
    await userEvent.type(screen.getByRole('combobox'), 'x')
    expect(screen.getByTestId('selected')).toHaveTextContent('')
  })

  it('closes on Escape without letting the key reach the editor', async () => {
    const { notes, labels } = makeNotes(10)
    const editorKeyDown = vi.fn()
    render(
      <div onKeyDown={(event) => editorKeyDown(event.key)}>
        <Picker notes={notes} labels={labels} />
      </div>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'garden')
    editorKeyDown.mockClear()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(editorKeyDown).not.toHaveBeenCalled()
  })

  it('keeps a 100,000-note library to 50 rendered options', async () => {
    const { notes, labels } = makeNotes(100_000)
    render(<Picker notes={notes} labels={labels} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.getAllByRole('option')).toHaveLength(MAX_LINK_PICKER_RESULTS)
    // The count follows the reader's locale ("99,950", "99 950", ...).
    expect(screen.getByRole('listbox')).toHaveTextContent(/99\D?950 more/)
  })
})
