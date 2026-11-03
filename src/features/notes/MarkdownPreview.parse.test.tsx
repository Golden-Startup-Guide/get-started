import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Counts how often the Markdown is parsed: each call parses the whole text.
const parses = vi.hoisted(() => ({ count: 0 }))
vi.mock('./markdownToHast', async (importOriginal) => {
  const original = await importOriginal<typeof import('./markdownToHast')>()
  return {
    markdownToHast: (markdown: string) => {
      parses.count += 1
      return original.markdownToHast(markdown)
    },
  }
})

const { MarkdownPreview } = await import('./MarkdownPreview')
const { markdownToHast } = await import('./markdownToHast')

describe('MarkdownPreview parsing', () => {
  afterEach(() => {
    cleanup()
    parses.count = 0
  })

  it('does not re-parse when only checklist interactivity changes', () => {
    const toggle = () => undefined
    const { rerender } = render(<MarkdownPreview markdown="- [ ] Task" onToggleTask={toggle} />)
    expect(parses.count).toBe(1)
    // The editor makes checkboxes read-only while the preview catches up after typing starts.
    rerender(<MarkdownPreview markdown="- [ ] Task" />)
    rerender(<MarkdownPreview markdown="- [ ] Task" onToggleTask={toggle} />)
    expect(parses.count).toBe(1)
  })

  it('re-parses when the Markdown changes', () => {
    const { rerender } = render(<MarkdownPreview markdown="First" />)
    rerender(<MarkdownPreview markdown="Second" />)
    expect(parses.count).toBe(2)
  })

  it('never parses when given a tree parsed elsewhere (by the worker, for long notes)', () => {
    const tree = markdownToHast('Parsed **elsewhere**')
    parses.count = 0
    const { container } = render(<MarkdownPreview markdown="Parsed **elsewhere**" tree={tree} />)
    expect(container.querySelector('strong')?.textContent).toBe('elsewhere')
    expect(parses.count).toBe(0)
  })
})
