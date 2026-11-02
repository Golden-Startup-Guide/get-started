import { useEffect, useLayoutEffect, useRef } from 'react'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { EditorState, type ChangeSpec } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { autocompletion } from '@codemirror/autocomplete'
import { wikilinkCompletions, type LinkTitle } from './wikilinkCompletion'

const NO_TITLES: readonly LinkTitle[] = []

/** The smallest single change that turns `from` into `to`, so the cursor elsewhere stays put. */
function diff(from: string, to: string): ChangeSpec {
  let start = 0
  const shortest = Math.min(from.length, to.length)
  while (start < shortest && from.charCodeAt(start) === to.charCodeAt(start)) start += 1
  let endFrom = from.length
  let endTo = to.length
  while (endFrom > start && endTo > start && from.charCodeAt(endFrom - 1) === to.charCodeAt(endTo - 1)) {
    endFrom -= 1
    endTo -= 1
  }
  return { from: start, to: endFrom, insert: to.slice(start, endTo) }
}

/**
 * The Markdown source editor (CodeMirror 6).
 *
 * It replaces a <textarea>: with 1 MB of text, a bare textarea alone took about 85 ms per
 * keystroke in Chromium on the development PC, because the browser lays out all of its text.
 * CodeMirror only renders the lines in view, which is why it scrolls inside a fixed height.
 */
export function MarkdownEditor({
  value,
  onChange,
  labelledBy,
  placeholder,
  linkTitles = NO_TITLES,
}: {
  value: string
  onChange: (value: string) => void
  /** ID of the visible label; it gives the editor its accessible name. */
  labelledBy: string
  placeholder: string
  /** Note titles suggested after typing "[[". */
  linkTitles?: readonly LinkTitle[]
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // The text the editor and React last agreed on. Comparing against it avoids turning the whole
  // document into a string on every render.
  const syncedRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const linkTitlesRef = useRef(linkTitles)
  const initialRef = useRef({ value, labelledBy, placeholder })

  useLayoutEffect(() => {
    onChangeRef.current = onChange
    linkTitlesRef.current = linkTitles
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const initial = initialRef.current
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          history(),
          // While suggestions are open, its own keymap (arrows, Enter, Escape) takes precedence.
          autocompletion({ override: [wikilinkCompletions(() => linkTitlesRef.current)], icons: false }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          placeholderExtension(initial.placeholder),
          EditorView.contentAttributes.of({ 'aria-labelledby': initial.labelledBy, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const text = update.state.doc.toString()
            syncedRef.current = text
            onChangeRef.current(text)
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // Changes made outside the editor (ticking a checklist item, restoring a revision).
  useEffect(() => {
    const view = viewRef.current
    if (!view || value === syncedRef.current) return
    const current = view.state.doc.toString()
    syncedRef.current = value
    if (current !== value) view.dispatch({ changes: diff(current, value) })
  }, [value])

  return <div ref={hostRef} className="markdown-editor" />
}
