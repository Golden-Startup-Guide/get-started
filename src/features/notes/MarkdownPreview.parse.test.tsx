import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Counts how often the Markdown is parsed: every render of react-markdown parses the whole text.
const renders = vi.hoisted(() => ({ count: 0 }))
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: ReactNode }) => {
    renders.count += 1
    return <div>{children}</div>
  },
}))

const { MarkdownPreview } = await import('./MarkdownPreview')

describe('MarkdownPreview parsing', () => {
  afterEach(() => {
    cleanup()
    renders.count = 0
  })

  it('does not re-parse when only checklist interactivity changes', () => {
    const toggle = () => undefined
    const { rerender } = render(<MarkdownPreview markdown="- [ ] Task" onToggleTask={toggle} />)
    expect(renders.count).toBe(1)
    // The editor makes checkboxes read-only while the preview catches up after typing starts.
    rerender(<MarkdownPreview markdown="- [ ] Task" />)
    rerender(<MarkdownPreview markdown="- [ ] Task" onToggleTask={toggle} />)
    expect(renders.count).toBe(1)
  })

  it('re-parses when the Markdown changes', () => {
    const { rerender } = render(<MarkdownPreview markdown="First" />)
    rerender(<MarkdownPreview markdown="Second" />)
    expect(renders.count).toBe(2)
  })
})
