import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview'
import { DELAYED_PREVIEW_THRESHOLD, PREVIEW_PAUSE_MS, usePreviewSource } from './usePreviewSource'

describe('usePreviewSource', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('previews short notes as they are typed', () => {
    const { result, rerender } = renderHook(({ content }) => usePreviewSource(content), { initialProps: { content: 'Hello' } })
    rerender({ content: 'Hello there' })
    expect(result.current).toEqual({ source: 'Hello there', stale: false, delayed: false })
  })

  it('waits for a pause in typing before previewing long notes', () => {
    vi.useFakeTimers()
    const long = 'a'.repeat(DELAYED_PREVIEW_THRESHOLD + 1)
    const { result, rerender } = renderHook(({ content }) => usePreviewSource(content), { initialProps: { content: long } })
    expect(result.current).toEqual({ source: long, stale: false, delayed: true })

    rerender({ content: `${long}b` })
    act(() => vi.advanceTimersByTime(PREVIEW_PAUSE_MS - 100))
    rerender({ content: `${long}bc` })
    act(() => vi.advanceTimersByTime(PREVIEW_PAUSE_MS - 100))
    // Still typing: the preview keeps the last version it rendered.
    expect(result.current).toEqual({ source: long, stale: true, delayed: true })

    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toEqual({ source: `${long}bc`, stale: false, delayed: true })
  })
})

describe('MarkdownPreview checklists', () => {
  afterEach(cleanup)

  it('makes checkboxes read-only when no toggle handler is given', () => {
    const { rerender } = render(<MarkdownPreview markdown="- [ ] Water plants" />)
    expect(screen.getByRole('checkbox', { name: 'Mark task Water plants complete' })).toBeDisabled()
    rerender(<MarkdownPreview markdown="- [ ] Water plants" onToggleTask={() => undefined} />)
    expect(screen.getByRole('checkbox', { name: 'Mark task Water plants complete' })).toBeEnabled()
  })
})
