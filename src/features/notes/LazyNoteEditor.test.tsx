import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteEditor } from './NoteEditor'

let failNextLoad = true
vi.mock('./NoteEditor', () => {
  if (failNextLoad) {
    failNextLoad = false
    throw new Error('Failed to fetch dynamically imported module')
  }
  return { NoteEditor: ({ note }: { note: { title: string } }) => <p>Editing {note.title}</p> }
})

const props = (onError: (message: string) => void) =>
  ({ note: { title: 'Plan' }, onError }) as unknown as ComponentProps<typeof NoteEditor>

describe('LazyNoteEditor', () => {
  afterEach(cleanup)

  it('reports a failed load, then loads on the next attempt and renders the editor', async () => {
    const { LazyNoteEditor } = await import('./LazyNoteEditor')
    const onError = vi.fn()

    const first = render(<LazyNoteEditor {...props(onError)} />)
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/)))
    expect(first.container).toBeEmptyDOMElement()
    first.unmount()

    render(<LazyNoteEditor {...props(onError)} />)
    expect(await screen.findByText('Editing Plan')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('renders straight away once the code has loaded', async () => {
    const { LazyNoteEditor } = await import('./LazyNoteEditor')
    render(<LazyNoteEditor {...props(vi.fn())} />)
    // Synchronous query: no loading pass when the chunk is already in memory.
    expect(screen.getByText('Editing Plan')).toBeInTheDocument()
  })
})
