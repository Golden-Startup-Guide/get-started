import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { normalizeTitle } from '../../lib/wikilinks'

export interface LinkTitle {
  title: string
  /** normalizeTitle(title), computed once rather than on every keystroke. */
  key: string
}

export const MAX_WIKILINK_SUGGESTIONS = 50

export function toLinkTitles(titles: Iterable<string>): LinkTitle[] {
  const result: LinkTitle[] = []
  for (const title of titles) {
    const trimmed = title.trim()
    if (trimmed) result.push({ title: trimmed, key: normalizeTitle(trimmed) })
  }
  return result
}

// Inserts the title and closes the link, reusing a "]]" that is already there.
function applyTitle(view: EditorView, completion: Completion, from: number, to: number) {
  const closed = view.state.sliceDoc(to, to + 2) === ']]'
  const insert = closed ? completion.label : `${completion.label}]]`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + completion.label.length + 2 },
    userEvent: 'input.complete',
  })
}

/**
 * Suggests note titles after "[[". Titles starting with what was typed come first, then titles
 * containing it, in the order given (most recently updated first), at most 50.
 */
export function wikilinkCompletions(getTitles: () => readonly LinkTitle[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const typed = context.matchBefore(/\[\[[^[\]|\n]*$/)
    if (!typed) return null
    const query = normalizeTitle(typed.text.slice(2))
    const starts: Completion[] = []
    const contains: Completion[] = []
    for (const { title, key } of getTitles()) {
      if (starts.length >= MAX_WIKILINK_SUGGESTIONS) break
      if (key.startsWith(query)) starts.push({ label: title, type: 'text', apply: applyTitle })
      else if (contains.length < MAX_WIKILINK_SUGGESTIONS && key.includes(query)) contains.push({ label: title, type: 'text', apply: applyTitle })
    }
    const options = [...starts, ...contains].slice(0, MAX_WIKILINK_SUGGESTIONS)
    if (!options.length) return null
    return { from: typed.from + 2, options, filter: false }
  }
}
