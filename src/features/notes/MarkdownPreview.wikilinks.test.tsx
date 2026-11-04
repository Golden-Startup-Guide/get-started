import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview, type WikilinkTarget } from './MarkdownPreview'

const notes: Record<string, WikilinkTarget> = {
  'garden plan': { id: 'garden', title: 'Garden plan' },
}
const resolve = (title: string) => notes[title.trim().toLocaleLowerCase()]

describe('MarkdownPreview wikilinks', () => {
  afterEach(cleanup)

  it('opens the linked note, shows the alias, and leaves code and unknown titles alone', () => {
    const onOpen = vi.fn()
    render(
      <MarkdownPreview
        markdown={'See [[Garden plan]], [[garden plan|the plan]], [[Missing note]].\n\n`[[Garden plan]]`\n\n```\n[[Garden plan]]\n```'}
        resolveWikilink={resolve}
        onOpenWikilink={onOpen}
      />,
    )
    const links = screen.getAllByRole('link', { name: /Garden plan|the plan/ })
    expect(links.map((link) => link.textContent)).toEqual(['Garden plan', 'the plan'])
    expect(links[0]).toHaveAttribute('title', 'Open note Garden plan')

    fireEvent.click(links[1])
    expect(onOpen).toHaveBeenCalledWith({ id: 'garden', title: 'Garden plan' })

    expect(screen.queryByRole('link', { name: 'Missing note' })).not.toBeInTheDocument()
    expect(screen.getByText('Missing note')).toHaveAttribute('title', 'No note titled “Missing note” yet')
    expect(screen.getAllByText('[[Garden plan]]')).toHaveLength(2)
  })

  it('shows links as plain text when the preview cannot open notes', () => {
    render(<MarkdownPreview markdown="Go to [[Garden plan]]" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Garden plan')).toHaveClass('wikilink-missing')
  })

  it('keeps wikilinks inside ordinary links as text', () => {
    render(<MarkdownPreview markdown="[A [[Garden plan]] link](https://example.com)" resolveWikilink={resolve} onOpenWikilink={vi.fn()} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com')
    expect(screen.getByRole('link')).toHaveTextContent('A [[Garden plan]] link')
  })
})

describe('section links in the preview', () => {
  afterEach(cleanup)

  it('reads "Note › Section", opens with the section, and links within the note by "#Section"', () => {
    const onOpen = vi.fn()
    const resolveWithSelf = (target: string) => (target.startsWith('#') ? { id: 'self', title: 'This note' } : resolve(target.split('#')[0]))
    render(
      <MarkdownPreview
        markdown={'See [[Garden plan#Seeds]], [[garden plan#Seeds|the seeds]], and [[#Harvest]].'}
        resolveWikilink={resolveWithSelf}
        onOpenWikilink={onOpen}
      />,
    )
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Garden plan › Seeds', 'the seeds', 'Harvest'])
    expect(screen.getByRole('link', { name: 'Garden plan › Seeds' })).toHaveAttribute('title', 'Open note Garden plan at “Seeds”')
    fireEvent.click(screen.getByRole('link', { name: 'Garden plan › Seeds' }))
    expect(onOpen).toHaveBeenLastCalledWith({ id: 'garden', title: 'Garden plan', section: 'Seeds' })
    fireEvent.click(screen.getByRole('link', { name: 'Harvest' }))
    expect(onOpen).toHaveBeenLastCalledWith({ id: 'self', title: 'This note', section: 'Harvest' })
  })
})
