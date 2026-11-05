import { startCompletion } from '@codemirror/autocomplete'
import { EditorSelection, type ChangeSpec } from '@codemirror/state'
import type { Command, EditorView } from '@codemirror/view'
import { htmlToMarkdown } from '../transfer/htmlToMarkdown'

/**
 * Formatting without knowing Markdown: the commands behind the formatting bar and Ctrl+B / Ctrl+I.
 * They write the same Markdown a person would type, so notes stay plain text underneath.
 */

/** Wraps the selection in a marker (or removes it if already there): `**bold**`, `_italic_`. */
export function toggleInline(marker: string): Command {
  const size = marker.length
  return (view) => {
    view.dispatch(view.state.changeByRange((range) => {
      const doc = view.state
      const before = doc.sliceDoc(range.from - size, range.from)
      const after = doc.sliceDoc(range.to, range.to + size)
      const text = doc.sliceDoc(range.from, range.to)
      if (before === marker && after === marker) {
        return {
          changes: [{ from: range.from - size, to: range.from }, { from: range.to, to: range.to + size }],
          range: EditorSelection.range(range.from - size, range.to - size),
        }
      }
      if (text.length >= size * 2 && text.startsWith(marker) && text.endsWith(marker)) {
        return {
          changes: [{ from: range.from, to: range.from + size }, { from: range.to - size, to: range.to }],
          range: EditorSelection.range(range.from, range.to - size * 2),
        }
      }
      return {
        changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
        range: EditorSelection.range(range.from + size, range.to + size),
      }
    }), { userEvent: 'input.format', scrollIntoView: true })
    return true
  }
}

export const BOLD = toggleInline('**')
export const ITALIC = toggleInline('_')

// What starts a line: a heading, a checklist item, a bullet, a number, or a quote.
const LINE_START = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/
type LineKind = 'heading' | 'checklist' | 'bullet' | 'numbered' | 'quote' | 'none'
const kindOf = (start: string): LineKind =>
  !start ? 'none'
    : start.startsWith('#') ? 'heading'
      : /\[[ xX]\]/.test(start) ? 'checklist'
        : /^[-*+]/.test(start) ? 'bullet'
          : /^\d/.test(start) ? 'numbered'
            : 'quote'

/**
 * Makes the selected lines a heading, a list, a checklist, or a quote; if they all already are,
 * makes them plain text again. Numbered lists are numbered 1, 2, 3.
 */
export function toggleLineStart(kind: Exclude<LineKind, 'none'>): Command {
  const startFor = (index: number) =>
    kind === 'heading' ? '## ' : kind === 'checklist' ? '- [ ] ' : kind === 'bullet' ? '- ' : kind === 'numbered' ? `${index + 1}. ` : '> '
  return (view) => {
    const { state } = view
    const lines = new Set<number>()
    for (const range of state.selection.ranges) {
      for (let line = state.doc.lineAt(range.from).number; line <= state.doc.lineAt(range.to).number; line += 1) lines.add(line)
    }
    const targets = [...lines].sort((a, b) => a - b).map((number) => state.doc.line(number))
    const parts = targets.map((line) => LINE_START.exec(line.text) as RegExpExecArray)
    const removing = parts.every((match) => kindOf(match[2] ?? '') === kind)
    const changes: ChangeSpec[] = targets.map((line, index) => {
      const [, indent, start = ''] = parts[index]
      return { from: line.from + indent.length, to: line.from + indent.length + start.length, insert: removing ? '' : startFor(index) }
    })
    view.dispatch({ changes, userEvent: 'input.format', scrollIntoView: true })
    return true
  }
}

/** A web address typed without "https://" (example.com/page) gets it added. */
export function normaliseUrl(input: string): string | undefined {
  const url = input.trim()
  if (!url) return undefined
  if (/^(https?:|mailto:)/i.test(url)) return url
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(url)) return `https://${url}`
  return undefined
}

/** Turns the selection into a link to a web address the user is asked for. */
export function insertLink(ask: () => string | null): Command {
  return (view) => {
    const range = view.state.selection.main
    const url = normaliseUrl(ask() ?? '')
    if (!url) return true
    const text = view.state.sliceDoc(range.from, range.to).trim() || url.replace(/^https?:\/\//, '')
    const link = `[${text.replace(/([[\]])/g, '\\$1')}](${url})`
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: link },
      selection: { anchor: range.from + link.length },
      userEvent: 'input.format',
      scrollIntoView: true,
    })
    return true
  }
}

/** Starts a link to another note: types "[[" and opens the list of notes. */
export const insertNoteLink: Command = (view) => {
  const range = view.state.selection.main
  view.dispatch({ changes: { from: range.from, to: range.to, insert: '[[' }, selection: { anchor: range.from + 2 }, userEvent: 'input.type' })
  startCompletion(view)
  return true
}

// HTML formatting worth keeping; plain HTML (a single line of text) is pasted as text.
const FORMATTED_HTML = /<(b|strong|i|em|h[1-6]|ul|ol|li|a\s|table|blockquote|pre|s|del|strike)\b|font-(weight|style)\s*:/i

/**
 * Pasting from a web page, Word, or Google Docs keeps the formatting (bold, lists, links,
 * headings, tables), converted to the Markdown it would take to type it.
 */
export function pasteFormatted(event: ClipboardEvent, view: EditorView): boolean {
  const html = event.clipboardData?.getData('text/html')
  if (!html || !FORMATTED_HTML.test(html)) return false
  const markdown = htmlToMarkdown(html)
  if (!markdown.trim()) return false
  event.preventDefault()
  view.dispatch(view.state.replaceSelection(markdown), { userEvent: 'input.paste', scrollIntoView: true })
  return true
}
