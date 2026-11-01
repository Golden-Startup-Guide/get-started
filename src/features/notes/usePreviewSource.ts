import { useDeferredValue, useEffect, useState } from 'react'

/** Notes longer than this (about 25 ms of Markdown parsing) preview after a pause in typing. */
export const DELAYED_PREVIEW_THRESHOLD = 50_000
export const PREVIEW_PAUSE_MS = 400

/**
 * The Markdown the preview should show for a draft.
 *
 * Parsing Markdown is the dominant cost of a keystroke in a large note: profiling typing in a
 * 1 MB note put 77% of the time in parsing, about 0.9 s per keystroke on the development PC.
 * Short notes still preview immediately (deferred, so typing is handled first); large notes
 * update once typing pauses for PREVIEW_PAUSE_MS.
 */
export function usePreviewSource(content: string): {
  /** The Markdown to render. */
  source: string
  /** The preview is behind the draft. */
  stale: boolean
  /** The draft is large enough that the preview waits for a pause in typing. */
  delayed: boolean
} {
  const delayed = content.length > DELAYED_PREVIEW_THRESHOLD
  const [paused, setPaused] = useState(content)
  useEffect(() => {
    if (!delayed) return
    const timer = setTimeout(() => setPaused(content), PREVIEW_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [content, delayed])
  const source = useDeferredValue(delayed ? paused : content)
  return { source, stale: source !== content, delayed }
}
