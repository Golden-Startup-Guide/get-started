import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { livePreview, markdownSyntax } from './livePreview'

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

function open(doc: string, cursor = doc.length) {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: [markdownSyntax, livePreview] }),
  })
  return view
}

const lines = () => Array.from(view!.contentDOM.querySelectorAll('.cm-line'))
const lineText = (index: number) => lines()[index].textContent

describe('live preview', () => {
  it('hides Markdown markers outside the line being edited, and keeps the text unchanged', () => {
    const doc = '# Garden plan\nSome **bold**, *italic*, ~~old~~ and `code`.\n[Seeds](https://example.com) and [[Weekly plan|the plan]]\n> A quote\nEnd'
    open(doc)
    expect(lines()[0].classList).toContain('cm-lp-h1')
    expect(lineText(0)).toBe('Garden plan')
    expect(lineText(1)).toBe('Some bold, italic, old and code.')
    expect(lines()[1].querySelector('.cm-lp-strong')?.textContent).toBe('bold')
    expect(lines()[1].querySelector('.cm-lp-code')?.textContent).toBe('code')
    expect(lineText(2)).toBe('Seeds and the plan')
    expect(lines()[2].querySelector('.cm-lp-wikilink')?.textContent).toBe('the plan')
    expect(lines()[3].classList).toContain('cm-lp-quote')
    expect(lineText(3)).toBe('A quote')
    // Only how it looks changes.
    expect(view!.state.doc.toString()).toBe(doc)
  })

  it('shows the Markdown of the line with the cursor, and of every selected line', () => {
    open('# Title\n**bold** text\nlast', 0)
    expect(lineText(0)).toBe('# Title')
    expect(lineText(1)).toBe('bold text')
    view!.dispatch({ selection: EditorSelection.range(0, 12) })
    expect(lineText(1)).toBe('**bold** text')
    view!.dispatch({ selection: { anchor: 20 } })
    expect(lineText(0)).toBe('Title')
  })

  it('shows a mark only while the cursor touches it, not anywhere on its line', () => {
    open('# Title\n**bold** text\n- item\nlast', 7)
    expect(lineText(0)).toBe('Title')
    view!.dispatch({ selection: { anchor: 21 } })
    expect(lineText(1)).toBe('bold text')
    view!.dispatch({ selection: { anchor: 11 } })
    expect(lineText(1)).toBe('**bold** text')
    view!.dispatch({ selection: { anchor: 28 } })
    expect(lineText(2)).toBe('• item')
    view!.dispatch({ selection: { anchor: 22 } })
    expect(lineText(2)).toBe('- item')
  })

  it('turns bullets into dots and task markers into checkboxes that edit the text', () => {
    open('- [ ] Water\n- [x] Compost\n- Plain\n1. First\nEnd')
    const boxes = view!.contentDOM.querySelectorAll<HTMLInputElement>('input.cm-lp-checkbox')
    expect(Array.from(boxes).map((box) => box.checked)).toEqual([false, true])
    expect(lineText(0)).toBe(' Water')
    expect(lines()[1].classList).toContain('cm-lp-task-done')
    expect(lineText(2)).toBe('• Plain')
    expect(lineText(3)).toBe('1. First')

    boxes[0].click()
    expect(view!.state.doc.line(1).text).toBe('- [x] Water')
    view!.contentDOM.querySelectorAll<HTMLInputElement>('input.cm-lp-checkbox')[1].click()
    expect(view!.state.doc.line(2).text).toBe('- [ ] Compost')
  })

  it('leaves code alone: no formatting or wikilinks inside code blocks or inline code', () => {
    open('```\n**not bold** [[Not a link]]\n```\nSee `[[raw]]`\nEnd')
    expect(lineText(1)).toBe('**not bold** [[Not a link]]')
    expect(lines()[1].classList).toContain('cm-lp-codeblock')
    expect(lines()[1].querySelector('.cm-lp-strong, .cm-lp-wikilink')).toBeNull()
    expect(lines()[3].querySelector('.cm-lp-wikilink')).toBeNull()
  })
})
