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
