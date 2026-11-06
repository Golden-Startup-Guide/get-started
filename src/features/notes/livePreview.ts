import { Language, defineLanguageFacet, syntaxTree } from '@codemirror/language'
import { type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { GFM, parser } from '@lezer/markdown'
import { WIKILINK_PATTERN } from '../../lib/wikilinks'
import { t } from '../../i18n/i18n'

/**
 * Live preview for the Markdown editor, in the style of Obsidian: Markdown stays the text being
 * edited, but it is shown formatted. Headings are larger, emphasis
 * and links lose their markers, list bullets become dots, and task markers become checkboxes that
 * can be ticked. A mark shows only while the cursor touches it, so it can be edited or removed.
 *
 * Uses @lezer/markdown directly rather than @codemirror/lang-markdown, which also bundles the
 * HTML, CSS, and JavaScript parsers. Only the visible lines are decorated, so the cost per
 * keystroke does not grow with the note.
 */
const markdownLanguage = new Language(defineLanguageFacet({}), parser.configure(GFM), [], 'markdown')

const hide = Decoration.replace({})
const mark = (className: string) => Decoration.mark({ class: className })
const line = (className: string) => Decoration.line({ class: className })

const STYLE = {
  Emphasis: mark('cm-lp-em'),
  StrongEmphasis: mark('cm-lp-strong'),
  Strikethrough: mark('cm-lp-strike'),
  InlineCode: mark('cm-lp-code'),
  link: mark('cm-lp-link'),
  wikilink: mark('cm-lp-link cm-lp-wikilink'),
  dim: mark('cm-lp-dim'),
}

class BulletWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-lp-bullet'
    span.textContent = '•'
    span.setAttribute('aria-hidden', 'true')
    return span
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly at: number) { super() }
  eq(other: CheckboxWidget) { return other.checked === this.checked && other.at === this.at }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-lp-checkbox'
    box.checked = this.checked
    box.tabIndex = -1
    box.setAttribute('aria-label', this.checked ? t('Mark task incomplete') : t('Mark task complete'))
    // Toggle by editing the text, so undo, autosave, and the preview all see a normal change.
    box.addEventListener('mousedown', (event) => event.preventDefault())
    box.addEventListener('click', (event) => {
      event.preventDefault()
      const marker = view.state.sliceDoc(this.at, this.at + 3)
      if (!/^\[[ xX]\]$/.test(marker)) return
      view.dispatch({ changes: { from: this.at + 1, to: this.at + 2, insert: this.checked ? ' ' : 'x' }, userEvent: 'input.toggle' })
    })
    return box
  }
  ignoreEvent() { return false }
}

class RuleWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const rule = document.createElement('span')
    rule.className = 'cm-lp-rule'
    rule.setAttribute('aria-hidden', 'true')
    return rule
  }
}

/**
 * Whether a cursor or selection touches the text from `from` to `to`. Formatting marks show only
 * then, so they can be changed or deleted; typing anywhere else on the line (inside a heading,
 * after a bold word) keeps them hidden, as in a word processor.
 */
function touches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from)
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const touched = (from: number, to: number) => touches(state, from, to)
  // A mark followed by a space ("# ", "- ", "> ") counts with its space.
  const withSpace = (to: number) => (state.sliceDoc(to, to + 1) === ' ' ? to + 1 : to)
  const decorations: Range<Decoration>[] = []
  const tree = syntaxTree(state)
  const codeRanges: Array<[number, number]> = []

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name)
        if (heading) {
          decorations.push(line(`cm-lp-h cm-lp-h${heading[1]}`).range(state.doc.lineAt(node.from).from))
          return
        }
        switch (name) {
          case 'HeaderMark': {
            if (touched(node.from, withSpace(node.to))) return
            // "# " — hide the marker and the space after it. Setext underlines are dimmed instead.
            if (state.sliceDoc(node.from, node.to).startsWith('#')) decorations.push(hide.range(node.from, withSpace(node.to)))
            else decorations.push(STYLE.dim.range(node.from, node.to))
            return
          }
          case 'Emphasis':
          case 'StrongEmphasis':
          case 'Strikethrough':
          case 'InlineCode':
            if (node.to > node.from) decorations.push(STYLE[name].range(node.from, node.to))
            if (name === 'InlineCode') codeRanges.push([node.from, node.to])
            return
          case 'EmphasisMark':
          case 'StrikethroughMark':
          case 'CodeMark':
            if (node.node.parent?.name === 'FencedCode') {
              decorations.push(STYLE.dim.range(node.from, node.to))
              return
            }
            {
              // Shown while the cursor is inside the formatted text, so the marks can be removed.
              const parent = node.node.parent
              if (!touched(parent?.from ?? node.from, parent?.to ?? node.to)) decorations.push(hide.range(node.from, node.to))
            }
            return
          case 'Link': {
            const marks = node.node.getChildren('LinkMark')
            const labelEnd = marks[1]?.from
            if (labelEnd !== undefined && marks[0]?.to < labelEnd) decorations.push(STYLE.link.range(marks[0].to, labelEnd))
            if (!touched(node.from, node.to) && marks.length >= 2) {
              decorations.push(hide.range(marks[0].from, marks[0].to))
              decorations.push(hide.range(marks[1].from, node.to))
            }
            return false
          }
          case 'Blockquote':
            for (let position = node.from; position <= node.to;) {
              const blockLine = state.doc.lineAt(position)
              decorations.push(line('cm-lp-quote').range(blockLine.from))
              position = blockLine.to + 1
            }
            return
          case 'QuoteMark':
            if (!touched(node.from, withSpace(node.to))) decorations.push(hide.range(node.from, withSpace(node.to)))
            return
          case 'ListMark': {
            const task = node.node.parent?.getChild('Task')?.getChild('TaskMarker')
            // A checklist item's "- [ ] " is one mark: shown only when the cursor is on it.
            if (touched(node.from, task ? withSpace(task.to) : withSpace(node.to))) return
            const text = state.sliceDoc(node.from, node.to)
            if (task) decorations.push(hide.range(node.from, withSpace(node.to)))
            else if (/^[-*+]$/.test(text)) decorations.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
            return
          }
          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to))
            if (checked) decorations.push(line('cm-lp-task-done').range(state.doc.lineAt(node.from).from))
            const listMark = node.node.parent?.parent?.getChild('ListMark')
            if (!touched(listMark?.from ?? node.from, withSpace(node.to))) {
              decorations.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to))
            }
            return
          }
          case 'HorizontalRule':
            if (!touched(node.from, node.to)) decorations.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to))
            return
          case 'FencedCode':
          case 'CodeBlock':
          case 'Table':
            codeRanges.push([node.from, node.to])
            for (let position = node.from; position <= node.to;) {
              const blockLine = state.doc.lineAt(position)
              decorations.push(line(name === 'Table' ? 'cm-lp-table' : 'cm-lp-codeblock').range(blockLine.from))
              position = blockLine.to + 1
            }
            // Children of a table are still decorated (emphasis inside cells); code is not.
            return name === 'Table' ? undefined : false
          default:
            return
        }
      },
    })

    // [[Wikilinks]] are not Markdown syntax, so they are found in the visible text.
    const text = state.sliceDoc(from, to)
    if (!text.includes('[[')) continue
    for (const match of text.matchAll(WIKILINK_PATTERN)) {
      const start = from + match.index
      const end = start + match[0].length
      if (codeRanges.some(([codeFrom, codeTo]) => start >= codeFrom && start < codeTo)) continue
      const target = match[1]
      const shown = match[2]
      const labelFrom = shown ? start + 2 + target.length + 1 : start + 2
      const labelTo = end - 2
      decorations.push(STYLE.wikilink.range(labelFrom, labelTo))
      if (!touched(start, end)) {
        decorations.push(hide.range(start, labelFrom))
        decorations.push(hide.range(labelTo, end))
      }
    }
  }
  return Decoration.set(decorations, true)
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged
        || update.viewportChanged
        || update.selectionSet
        || syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/** The Markdown parser alone; the source mode uses it too, so switching modes does not reparse. */
export const markdownSyntax: Extension = markdownLanguage

export const livePreview: Extension = [livePreviewPlugin, EditorView.editorAttributes.of({ class: 'cm-live-preview' })]
