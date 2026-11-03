import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { markdownToHast } from './markdownToHast'
import { MarkdownPreview } from './MarkdownPreview'
import { collectHeadings, MAX_CONTENTS_ITEMS } from './noteHeadings'

describe('heading anchors and the table of contents', () => {
  afterEach(cleanup)

  it('gives headings readable, unique anchors', () => {
    const headings = collectHeadings(markdownToHast('# Garden Plan!\n## Notes\n## Notes\n### Café & tea\n> ## Quoted\n## \n'))
    expect(headings).toEqual([
      { id: 'heading-garden-plan', text: 'Garden Plan!', depth: 1 },
      { id: 'heading-notes', text: 'Notes', depth: 2 },
      { id: 'heading-notes-1', text: 'Notes', depth: 2 },
      { id: 'heading-café-tea', text: 'Café & tea', depth: 3 },
      { id: 'heading-section', text: '', depth: 2 },
    ])
  })

  it('shows contents only for notes with three or more headings, and only when asked', () => {
    render(<MarkdownPreview markdown={'# One\n## Two'} showContents />)
    expect(screen.queryByRole('navigation', { name: 'Contents' })).not.toBeInTheDocument()
    cleanup()
    render(<MarkdownPreview markdown={'# One\n## Two\n## Three'} />)
    expect(screen.queryByRole('navigation', { name: 'Contents' })).not.toBeInTheDocument()
  })

  it('opens the list and moves focus to the chosen heading', async () => {
    const user = userEvent.setup()
    render(<MarkdownPreview markdown={'# Plan\n\nIntro\n\n## Seeds\n\nText\n\n### Tomatoes\n\n## Harvest'} showContents />)
    const toggle = screen.getByRole('button', { name: /Contents/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent(/^Contents\s*4$/)

    await user.click(toggle)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Plan', 'Seeds', 'Tomatoes', 'Harvest'])
    expect(within(list).getByRole('link', { name: 'Tomatoes' })).toHaveAttribute('href', '#heading-tomatoes')

    await user.click(within(list).getByRole('link', { name: 'Tomatoes' }))
    expect(screen.getByRole('heading', { name: 'Tomatoes' })).toHaveFocus()
  })

  it('lists at most a few hundred headings', async () => {
    const user = userEvent.setup()
    const markdown = Array.from({ length: MAX_CONTENTS_ITEMS + 5 }, (_, index) => `## Part ${index}`).join('\n')
    render(<MarkdownPreview markdown={markdown} showContents />)
    await user.click(screen.getByRole('button', { name: /Contents/ }))
    expect(screen.getAllByRole('link', { name: /^Part / })).toHaveLength(MAX_CONTENTS_ITEMS)
    expect(screen.getByText('and 5 more headings')).toBeInTheDocument()
  })
})
