import { CompletionContext, type Completion } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { isoDate } from '../../lib/templates'
import { slashCommandCompletions } from './slashCommands'

let view: EditorView | undefined
afterEach(() => view?.destroy())

const labels = (doc: string) => slashCommandCompletions(new CompletionContext(EditorState.create({ doc }), doc.length, false))?.options.map((option) => option.label)

type Apply = (view: EditorView, completion: Completion, from: number, to: number) => void

/** Types `doc`, picks the command, and returns the text with | where the cursor ends up. */
function run(doc: string, label: string) {
  view?.destroy()
  view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: doc.length } }) })
  const result = slashCommandCompletions(new CompletionContext(view.state, doc.length, false))!
  const option = result.options.find((item) => item.label === label)!
  ;(option.apply as Apply)(view, option, result.from, doc.length)
  const text = view.state.doc.toString()
  // | marks the cursor; [ and ] mark a selection.
  const { from, to } = view.state.selection.main
  return from === to ? text.slice(0, from) + '|' + text.slice(from) : text.slice(0, from) + '[' + text.slice(from, to) + ']' + text.slice(to)
}

describe('slash commands', () => {
  it('opens after a slash at the start of a line or after a space, but not inside words, addresses, dates, or code', () => {
    expect(labels('/')).toContain('Heading 1')
    expect(labels('Some text /')).toContain('Checklist')
    expect(labels('and/or')).toBeUndefined()
    expect(labels('see https://example.com/')).toBeUndefined()
    expect(labels('on 3/11')).toBeUndefined()
    expect(labels('```\n/')).toBeUndefined()
    expect(labels('```\ncode\n```\n/')).toContain('Quote')
  })

  it('narrows as you type, labels first, then keywords', () => {
    expect(labels('/head')).toEqual(['Heading 1', 'Heading 2', 'Heading 3'])
    expect(labels('/list')).toEqual(['Bullet list', 'Numbered list', 'Checklist'])
    expect(labels('/todo')).toEqual(['Checklist'])
    expect(labels('/formula')).toEqual(['Maths block'])
    expect(labels('/zzz')).toBeUndefined()
  })

  it('replaces the slash with the Markdown and puts the cursor where you type next', () => {
    expect(run('/he', 'Heading 2')).toBe('## |')
    expect(run('  /', 'Checklist')).toBe('- [ ] |')
    expect(run('/', 'Code block')).toBe('```\n|\n```')
    expect(run('/', 'Table')).toBe('| [Column] | Column |\n|---|---|\n|  |  |')
    expect(run('/', 'Diagram')).toBe('```mermaid\nflowchart LR\n  [A --> B]\n```')
  })

  it('moves block commands to a new line after other text, and inserts inline ones in place', () => {
    expect(run('Shopping /', 'Checklist')).toBe('Shopping \n- [ ] |')
    expect(run('Read /', 'Link to note')).toBe('Read [[|')
    expect(run('Due /', 'Today’s date')).toBe(`Due ${isoDate(new Date())}|`)
    expect(run('First line\n/qu', 'Quote')).toBe('First line\n> |')
  })
})
