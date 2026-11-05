import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BOLD, insertLink, ITALIC, normaliseUrl, pasteFormatted, toggleLineStart } from './formatting'

let view: EditorView | undefined
afterEach(() => view?.destroy())

// jsdom has no layout; CodeMirror measures text when scrolling the cursor into view.
beforeAll(() => {
  const empty = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getClientRects = empty
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})

/** An editor holding `text`, with the selection between the [ and ] marks (or at a single |). */
function editor(marked: string) {
  const from = marked.search(/[[|]/)
  const plain = marked.replace(/[[\]|]/g, '')
  const to = marked.includes('|') ? from : marked.indexOf(']') - 1
  view = new EditorView({ parent: document.body, state: EditorState.create({ doc: plain, selection: EditorSelection.range(from, to) }) })
  return view
}
const text = (current: EditorView) => current.state.doc.toString()
const selected = (current: EditorView) => current.state.sliceDoc(current.state.selection.main.from, current.state.selection.main.to)

describe('formatting without Markdown', () => {
  it('makes text bold or italic, and plain again', () => {
    const bold = editor('Water the [basil] today')
    BOLD(bold)
    expect(text(bold)).toBe('Water the **basil** today')
    expect(selected(bold)).toBe('basil')
    BOLD(bold)
    expect(text(bold)).toBe('Water the basil today')

    const italic = editor('A [quiet] note')
    ITALIC(italic)
    expect(text(italic)).toBe('A _quiet_ note')
    // Selecting the marks too works the same way.
    const marked = editor('A [_quiet_] note')
    ITALIC(marked)
    expect(text(marked)).toBe('A quiet note')

    // With nothing selected, the marks go around the cursor, ready to type.
    const empty = editor('Start |here')
    BOLD(empty)
    expect(text(empty)).toBe('Start ****here')
    expect(empty.state.selection.main.head).toBe('Start **'.length)
  })

  it('turns lines into headings, lists, checklists, and quotes, and back', () => {
    const lines = editor('[Eggs\nMilk\nBread]')
    toggleLineStart('bullet')(lines)
    expect(text(lines)).toBe('- Eggs\n- Milk\n- Bread')
    // Another kind of list replaces this one.
    toggleLineStart('checklist')(lines)
    expect(text(lines)).toBe('- [ ] Eggs\n- [ ] Milk\n- [ ] Bread')
    toggleLineStart('numbered')(lines)
    expect(text(lines)).toBe('1. Eggs\n2. Milk\n3. Bread')
    toggleLineStart('numbered')(lines)
    expect(text(lines)).toBe('Eggs\nMilk\nBread')

    const heading = editor('Intro\nPlan|s ahead')
    toggleLineStart('heading')(heading)
    expect(text(heading)).toBe('Intro\n## Plans ahead')
    toggleLineStart('heading')(heading)
    expect(text(heading)).toBe('Intro\nPlans ahead')

    const quote = editor('  Indented |line')
    toggleLineStart('quote')(quote)
    expect(text(quote)).toBe('  > Indented line')
  })

  it('links the selection to a web address, adding https:// when missing', () => {
    const linked = editor('See [the garden guide] soon')
    insertLink(() => 'example.com/garden')(linked)
    expect(text(linked)).toBe('See [the garden guide](https://example.com/garden) soon')

    const bare = editor('Visit |')
    insertLink(() => 'https://example.org')(bare)
    expect(text(bare)).toBe('Visit [example.org](https://example.org)')

    const cancelled = editor('Keep [this]')
    insertLink(() => null)(cancelled)
    expect(text(cancelled)).toBe('Keep this')

    expect(normaliseUrl('mailto:me@example.com')).toBe('mailto:me@example.com')
    expect(normaliseUrl('not a link')).toBeUndefined()
    expect(normaliseUrl('javascript:alert(1)')).toBeUndefined()
  })

  it('keeps formatting pasted from Google Docs and web pages, and pastes plain text as it is', () => {
    // jsdom has no DataTransfer; a paste event needs only its clipboard data and preventDefault.
    const paste = (html: string, current: EditorView) => {
      const data: Record<string, string> = { 'text/html': html, 'text/plain': 'plain' }
      const event = { clipboardData: { getData: (type: string) => data[type] ?? '' }, preventDefault: () => undefined }
      return pasteFormatted(event as unknown as ClipboardEvent, current)
    }
    const docs = editor('|')
    // Google Docs wraps everything in a "not bold" <b>, and marks bold with a styled <span>.
    expect(paste('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:700">Buy</span><span style="font-weight:400"> seeds</span></p><ul><li><p><span>Basil</span></p></li></ul></b>', docs)).toBe(true)
    expect(text(docs)).toBe('**Buy** seeds\n\n- Basil')

    const web = editor('|')
    expect(paste('<h2>Plan</h2><p>See <a href="https://example.com">this</a> and <em>that</em>.</p>', web)).toBe(true)
    expect(text(web)).toBe('## Plan\n\nSee [this](https://example.com) and *that*.')

    const plain = editor('|')
    expect(paste('<span>Just words</span>', plain)).toBe(false)
  })
})
