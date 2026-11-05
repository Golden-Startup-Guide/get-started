import { useEffect, useLayoutEffect, useRef } from 'react'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState, type ChangeSpec, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension, type Command } from '@codemirror/view'
import { autocompletion } from '@codemirror/autocomplete'
import type { EditorMode } from '../../types'
import { livePreview, markdownSyntax } from './livePreview'
import { slashCommandCompletions } from './slashCommands'
import { FormattingBar } from './FormattingBar'
import { BOLD, ITALIC, pasteFormatted } from './formatting'
import { wikilinkCompletions, type LinkTitle } from './wikilinkCompletion'

const noTitles = (): readonly LinkTitle[] => []
const noHeadings = (): readonly string[] => []

// Source mode has no Markdown parser at all, so it costs exactly what it did before live preview.
const modeExtension = (mode: EditorMode): Extension => (mode === 'live' ? [markdownSyntax, livePreview] : [])
const modeCompartment = new Compartment()
// How many reported texts are remembered; far more keystrokes than React ever falls behind.
const MAX_REPORTED = 50

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
  getLinkTitles = noTitles,
  getLinkHeadings = noHeadings,
  mode = 'source',
  reveal,
  formattingBar = false,
}: {
  value: string
  onChange: (value: string) => void
  /** ID of the visible label; it gives the editor its accessible name. */
  labelledBy: string
  placeholder: string
  /** Note titles suggested after typing "[["; called only then. */
  getLinkTitles?: () => readonly LinkTitle[]
  /** Headings suggested after "[[Title#" (an empty title means this note). */
  getLinkHeadings?: (title: string) => readonly string[]
  /** 'live' formats Markdown outside the lines being edited; 'source' shows it all as typed. */
  mode?: EditorMode
  /** Moves the cursor to the start of this 1-based line and scrolls it to the top; a new object each time. */
  reveal?: { line: number }
  /** Show buttons for bold, lists, links, and the rest above the text. */
  formattingBar?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // The text the editor and React last agreed on. Comparing against it avoids turning the whole
  // document into a string on every render.
  const syncedRef = useRef(value)
  // Texts reported through onChange that React has not passed back as `value` yet, oldest first.
  const reportedRef = useRef<string[]>([])
  const onChangeRef = useRef(onChange)
  const getLinkTitlesRef = useRef(getLinkTitles)
  const getLinkHeadingsRef = useRef(getLinkHeadings)
  const initialRef = useRef({ value, labelledBy, placeholder, mode })

  useLayoutEffect(() => {
    onChangeRef.current = onChange
    getLinkTitlesRef.current = getLinkTitles
    getLinkHeadingsRef.current = getLinkHeadings
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
          autocompletion({ override: [wikilinkCompletions(() => getLinkTitlesRef.current(), (title) => getLinkHeadingsRef.current(title)), slashCommandCompletions], icons: false }),
          // Ctrl+B and Ctrl+I (⌘ on a Mac), as in a word processor. (Ctrl+K stays the command palette.)
          keymap.of([{ key: 'Mod-b', run: BOLD }, { key: 'Mod-i', run: ITALIC }, ...defaultKeymap, ...historyKeymap]),
          EditorView.domEventHandlers({ paste: pasteFormatted }),
          EditorView.lineWrapping,
          modeCompartment.of(modeExtension(initial.mode)),
          placeholderExtension(initial.placeholder),
          EditorView.contentAttributes.of({ 'aria-labelledby': initial.labelledBy, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const text = update.state.doc.toString()
            syncedRef.current = text
            reportedRef.current.push(text)
            if (reportedRef.current.length > MAX_REPORTED) reportedRef.current.shift()
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

  useEffect(() => {
    viewRef.current?.dispatch({ effects: modeCompartment.reconfigure(modeExtension(mode)) })
  }, [mode])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !reveal) return
    const line = view.state.doc.line(Math.min(Math.max(reveal.line, 1), view.state.doc.lines))
    view.dispatch({ selection: { anchor: line.from } })
    // Scroll only the editor's own text area: CodeMirror's scrollIntoView also scrolls the page
    // and dialog around it, which would pull the preview away from the same heading.
    view.requestMeasure({
      read: (current) => current.lineBlockAt(line.from).top,
      write: (top, current) => { current.scrollDOM.scrollTop = Math.max(0, top - 12) },
    })
  }, [reveal])

  // Changes made outside the editor (ticking a checklist item, restoring a revision).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // Text this editor reported itself can come back after newer typing: this effect may run after
    // the next keystroke. Applying it would undo that keystroke, so it is recognised and skipped.
    // (Strings the editor passed out come back as the same objects, so these checks are cheap.)
    const reported = reportedRef.current.indexOf(value)
    if (reported >= 0) {
      reportedRef.current.splice(0, reported + 1)
      return
    }
    if (value === syncedRef.current) return
    const current = view.state.doc.toString()
    syncedRef.current = value
    if (current !== value) view.dispatch({ changes: diff(current, value) })
  }, [value])

  const run = (command: Command) => {
    const view = viewRef.current
    if (!view) return
    command(view)
    view.focus()
  }

  return (
    <>
      {formattingBar && <FormattingBar run={run} />}
      <div ref={hostRef} className="markdown-editor" />
    </>
  )
}
