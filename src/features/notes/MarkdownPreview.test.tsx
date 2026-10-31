import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview'

describe('MarkdownPreview', () => {
  it('maps each checkbox to its own source line, even after code blocks and in quotes', () => {
    const onToggleTask = vi.fn()
    const markdown = '```\n- [ ] Code sample\n```\n\n- [ ] Real task\n\n> - [x] Quoted task'
    render(<MarkdownPreview markdown={markdown} onToggleTask={onToggleTask} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark task Real task complete' }))
    expect(onToggleTask).toHaveBeenLastCalledWith(5)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark task Quoted task incomplete' }))
    expect(onToggleTask).toHaveBeenLastCalledWith(7)
  })

  it('loads remote images only on request and keeps local images', () => {
    render(<MarkdownPreview markdown={'![Pixel](https://tracker.example/p.png)\n\n![Local](/my-notes.svg)'} onToggleTask={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Local' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Pixel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load image “Pixel” from tracker.example' }))
    expect(screen.getByRole('img', { name: 'Pixel' })).toHaveAttribute('src', 'https://tracker.example/p.png')
  })
})
