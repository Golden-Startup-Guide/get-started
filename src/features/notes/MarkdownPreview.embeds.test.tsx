import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview, type EmbeddedNote } from './MarkdownPreview'

const notes: Record<string, EmbeddedNote> = {
  'garden plan': { id: 'garden', title: 'Garden plan', content: '# Garden\n\nIntro\n\n## Seeds\n\n- [ ] Buy seeds\n\n## Harvest\n\nPick' },
  'loop a': { id: 'a', title: 'Loop A', content: 'A shows ![[Loop B]] inline, and:\n\n![[Loop B]]' },
  'loop b': { id: 'b', title: 'Loop B', content: 'B shows:\n\n![[Loop A]]' },
}
const resolveEmbed = (target: string) => notes[target.split('#')[0].trim().toLocaleLowerCase()]
const resolveWikilink = (target: string) => resolveEmbed(target)

function show(markdown: string, noteId = 'host') {
  const onOpen = vi.fn()
  const view = render(
    <MarkdownPreview markdown={markdown} noteId={noteId} resolveEmbed={resolveEmbed} resolveWikilink={resolveWikilink} onOpenWikilink={onOpen} />,
  )
  return { ...view, onOpen }
}

describe('embedded notes', () => {
  afterEach(cleanup)

  it('shows a whole note in place of ![[Note]], with a link to open it', () => {
    const { onOpen } = show('Before\n\n![[Garden plan]]\n\nAfter')
    const embed = screen.getByRole('region', { name: 'Embedded: Garden plan' })
    expect(within(embed).getByRole('heading', { name: 'Garden' })).toBeInTheDocument()
    expect(within(embed).getByText('Pick')).toBeInTheDocument()
    // Read-only, and without heading anchors that could clash with the host note's.
    expect(within(embed).getByRole('checkbox')).toBeDisabled()
    expect(within(embed).getByRole('heading', { name: 'Garden' })).not.toHaveAttribute('id')
    fireEvent.click(within(embed).getByRole('link', { name: 'Garden plan' }))
    expect(onOpen).toHaveBeenCalledWith({ id: 'garden', title: 'Garden plan', section: undefined })
  })

  it('shows just a section for ![[Note#Section]]', () => {
    show('![[Garden plan#seeds]]')
    const embed = screen.getByRole('region', { name: 'Embedded: Garden plan › seeds' })
    expect(within(embed).getByRole('heading', { name: 'Seeds' })).toBeInTheDocument()
    expect(within(embed).queryByText('Pick')).not.toBeInTheDocument()
    expect(within(embed).queryByText('Intro')).not.toBeInTheDocument()
  })

  it('explains missing notes and sections instead of showing nothing', () => {
    show('![[Nowhere]]\n\n![[Garden plan#Pruning]]')
    expect(screen.getByText('No note titled “Nowhere” to show here.')).toBeInTheDocument()
    expect(screen.getByText('“Garden plan” has no section “Pruning”.')).toBeInTheDocument()
  })

  it('never repeats a note inside itself, so loops stop', () => {
    show('![[Garden plan]]', 'garden')
    expect(screen.getByText('“Garden plan” is already shown above, so it is not repeated here.')).toBeInTheDocument()
    cleanup()
    // A embeds B, which embeds A: the inner A is not shown again.
    show('![[Loop A]]', 'host')
    // The repeat is still labelled, as a short message, so the outer embed is the first of the two.
    const [outer, repeat] = screen.getAllByRole('region', { name: 'Embedded: Loop A' })
    expect(within(repeat).queryByRole('region')).not.toBeInTheDocument()
    const inner = within(outer).getByRole('region', { name: 'Embedded: Loop B' })
    expect(within(inner).getByText('“Loop A” is already shown above, so it is not repeated here.')).toBeInTheDocument()
  })

  it('treats ![[Note]] inside a sentence as a link', () => {
    show('See ![[Garden plan]] here.')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Garden plan' })).toBeInTheDocument()
    expect(screen.getByText(/^See/).textContent).toBe('See Garden plan here.')
  })
})
