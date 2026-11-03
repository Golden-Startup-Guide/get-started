import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview'

// Mermaid needs a real browser to measure text, so the renderer is replaced here; the end-to-end
// tests draw real diagrams.
const renderDiagram = vi.hoisted(() => vi.fn(async (source: string, theme: string) =>
  source.includes('-->') && !source.trim().endsWith('-->')
    ? { svg: `<svg data-theme="${theme}"><text>${source.length}</text></svg>` }
    : { error: 'Parse error on line 2' }))
vi.mock('./diagramRenderer', () => ({ renderDiagram }))

describe('Mermaid diagrams in the preview', () => {
  afterEach(() => {
    cleanup()
    renderDiagram.mockClear()
  })

  it('draws ```mermaid blocks, showing the source until the drawing is ready', async () => {
    const { container } = render(
      <div className="workspace" data-theme="light">
        <MarkdownPreview markdown={'```mermaid\nflowchart LR\n  A --> B\n```'} />
      </div>,
    )
    expect(container.querySelector('.diagram-source')?.textContent).toBe('flowchart LR\n  A --> B')
    await waitFor(() => expect(container.querySelector('.diagram-drawing svg')).not.toBeNull())
    expect(renderDiagram).toHaveBeenCalledWith('flowchart LR\n  A --> B', 'light')
    expect(container.querySelector('pre')).toBeNull()
  })

  it('shows the source and the problem when a diagram has a mistake', async () => {
    render(<MarkdownPreview markdown={'```mermaid\nflowchart LR\n  A -->\n```'} />)
    expect(await screen.findByRole('note')).toHaveTextContent('Diagram error: Parse error on line 2')
    expect(screen.getByText(/flowchart LR/)).toBeInTheDocument()
  })

  it('redraws in the dark theme when the app switches theme', async () => {
    const { container } = render(
      <div className="workspace" data-theme="light">
        <MarkdownPreview markdown={'```mermaid\nflowchart LR\n  A --> B\n```'} />
      </div>,
    )
    await waitFor(() => expect(container.querySelector('svg')).toHaveAttribute('data-theme', 'light'))
    await act(async () => container.querySelector('.workspace')!.setAttribute('data-theme', 'dark'))
    await waitFor(() => expect(container.querySelector('svg')).toHaveAttribute('data-theme', 'dark'))
  })

  it('leaves other code blocks as code', () => {
    const { container } = render(<MarkdownPreview markdown={'```text\nflowchart LR\n```'} />)
    expect(container.querySelector('pre code')?.textContent).toBe('flowchart LR\n')
    expect(renderDiagram).not.toHaveBeenCalled()
  })
})
