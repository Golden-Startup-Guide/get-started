import type { Root } from 'hast'

/** Code blocks longer than this are shown without colours; highlighting them would stall typing. */
export const MAX_HIGHLIGHT_LENGTH = 50_000

type Highlight = (code: string, language: string) => Root | undefined

let loading: Promise<Highlight> | undefined

/**
 * The syntax highlighter (lowlight, with highlight.js's 37 common languages), loaded the first
 * time a note shows a code block with a language. It returns a syntax tree rather than HTML, so
 * the result is rendered like the rest of the preview and nothing is injected as raw HTML.
 */
export function loadHighlighter(): Promise<Highlight> {
  loading ??= import('./highlighter').then(
    (module) => module.highlight,
    (error: unknown) => {
      // Allow another attempt later, for example once the network is back.
      loading = undefined
      throw error
    },
  )
  return loading
}
