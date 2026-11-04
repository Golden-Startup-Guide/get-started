import { CompletionContext, type Completion } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_WIKILINK_SUGGESTIONS, toLinkTitles, wikilinkCompletions } from './wikilinkCompletion'

const titles = toLinkTitles(['Weekly plan', 'Garden plan', 'Plan B', '  ', 'Reading list'])
const complete = wikilinkCompletions(() => titles)

function suggest(doc: string) {
  const state = EditorState.create({ doc })
  return complete(new CompletionContext(state, doc.length, false))
}

let view: EditorView | undefined
afterEach(() => view?.destroy())

describe('wikilinkCompletions', () => {
  it('suggests nothing outside an open [[', () => {
    expect(suggest('plain text')).toBeNull()
    expect(suggest('[[Done]] after')).toBeNull()
    expect(suggest('[single')).toBeNull()
  })

  it('lists titles starting with the query first, then ones containing it', () => {
    const result = suggest('See [[pla')
    expect(result?.from).toBe(6)
    expect(result?.options.map((option) => option.label)).toEqual(['Plan B', 'Weekly plan', 'Garden plan'])
  })

  it('offers every title right after [[ and nothing when no title matches', () => {
    expect(suggest('[[')?.options).toHaveLength(4)
    expect(suggest('[[zzz')).toBeNull()
  })

  it('caps the list', () => {
    const many = toLinkTitles(Array.from({ length: 200 }, (_, index) => `Note ${index}`))
    const state = EditorState.create({ doc: '[[note' })
    expect(wikilinkCompletions(() => many)(new CompletionContext(state, 6, false))?.options).toHaveLength(MAX_WIKILINK_SUGGESTIONS)
  })

  it('inserts the title and closes the link, reusing an existing "]]"', () => {
    for (const [doc, cursor, expected] of [['[[gar', 5, '[[Garden plan]]'], ['[[gar]]', 5, '[[Garden plan]]']] as const) {
      view?.destroy()
      view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: cursor } }) })
      const result = complete(new CompletionContext(view.state, cursor, false))!
      const option = result.options[0] as Completion & { apply: (view: EditorView, completion: Completion, from: number, to: number) => void }
      option.apply(view, option, result.from, cursor)
      expect(view.state.doc.toString()).toBe(expected)
      expect(view.state.selection.main.head).toBe(expected.length)
    }
  })
})

describe('heading suggestions', () => {
  it('suggests the named note’s headings after "#", and this note’s after "[[#"', () => {
    const headings = (title: string) => (title === 'Garden plan' ? ['Seeds', 'Harvest time'] : title === '' ? ['Intro'] : [])
    const complete = wikilinkCompletions(() => titles, headings)
    const at = (doc: string) => complete(new CompletionContext(EditorState.create({ doc }), doc.length, false))
    expect(at('[[Garden plan#')?.options.map((option) => option.label)).toEqual(['Seeds', 'Harvest time'])
    expect(at('[[Garden plan#harv')?.options.map((option) => option.label)).toEqual(['Harvest time'])
    expect(at('[[Garden plan#harv')?.from).toBe('[[Garden plan#'.length)
    expect(at('[[#')?.options.map((option) => option.label)).toEqual(['Intro'])
    expect(at('[[Unknown#')).toBeNull()
  })
})
