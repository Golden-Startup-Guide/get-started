import { startCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { isoDate } from '../../lib/templates'
import { msg, t } from '../../i18n/i18n'

/** Marks where the cursor goes after inserting; with SELECTION_END, the text between is selected. */
const CURSOR = '\u0000'
const SELECTION_END = '\u0001'

interface SlashCommand {
  label: string
  /** Shown after the label, as a reminder of the Markdown it writes. */
  detail: string
  /** Extra words that should find this command. */
  keywords?: string
  /** Goes at the start of its own line. */
  block: boolean
  /** Opens suggestions again after inserting (note titles after [[). */
  suggestAfter?: boolean
  text: () => string
}

const pad = (value: number) => String(value).padStart(2, '0')

export const SLASH_COMMANDS: SlashCommand[] = [
  { label: msg('Heading 1'), detail: '#', keywords: 'title h1', block: true, text: () => `# ${CURSOR}` },
  { label: msg('Heading 2'), detail: '##', keywords: 'subtitle h2', block: true, text: () => `## ${CURSOR}` },
  { label: msg('Heading 3'), detail: '###', keywords: 'h3', block: true, text: () => `### ${CURSOR}` },
  { label: msg('Checklist'), detail: '- [ ]', keywords: 'todo task checkbox', block: true, text: () => `- [ ] ${CURSOR}` },
  { label: msg('Bullet list'), detail: '-', keywords: 'unordered list', block: true, text: () => `- ${CURSOR}` },
  { label: msg('Numbered list'), detail: '1.', keywords: 'ordered list', block: true, text: () => `1. ${CURSOR}` },
  { label: msg('Quote'), detail: '>', keywords: 'blockquote citation', block: true, text: () => `> ${CURSOR}` },
  { label: msg('Code block'), detail: '```', keywords: 'snippet programming', block: true, text: () => `\`\`\`\n${CURSOR}\n\`\`\`` },
  { label: msg('Table'), detail: '| |', keywords: 'grid columns rows', block: true, text: () => `| ${CURSOR}Column${SELECTION_END} | Column |\n|---|---|\n|  |  |` },
  { label: msg('Divider'), detail: '---', keywords: 'horizontal rule line separator', block: true, text: () => `---\n${CURSOR}` },
  { label: msg('Maths block'), detail: '$$', keywords: 'math formula equation latex tex', block: true, text: () => `$$\n${CURSOR}\n$$` },
  { label: msg('Diagram'), detail: 'mermaid', keywords: 'flowchart chart graph mermaid', block: true, text: () => `\`\`\`mermaid\nflowchart LR\n  ${CURSOR}A --> B${SELECTION_END}\n\`\`\`` },
  { label: msg('Link to note'), detail: '[[ ]]', keywords: 'wikilink reference', block: false, suggestAfter: true, text: () => `[[${CURSOR}` },
  { label: msg('Today’s date'), detail: 'YYYY-MM-DD', keywords: 'date day now', block: false, text: () => `${isoDate(new Date())}${CURSOR}` },
  { label: msg('Current time'), detail: 'HH:MM', keywords: 'time clock now', block: false, text: () => { const now = new Date(); return `${pad(now.getHours())}:${pad(now.getMinutes())}${CURSOR}` } },
]

function insert(view: EditorView, command: SlashCommand, slashAt: number, to: number) {
  const line = view.state.doc.lineAt(slashAt)
  const before = view.state.sliceDoc(line.from, slashAt)
  // Block commands start their own line: after other text, they move to the next one.
  const prefix = command.block && before.trim() ? '\n' : ''
  const text = prefix + command.text()
  const cursor = text.indexOf(CURSOR)
  const selectionEnd = text.replace(CURSOR, '').indexOf(SELECTION_END)
  const insertText = text.replace(CURSOR, '').replace(SELECTION_END, '')
  const from = command.block && !before.trim() ? line.from : slashAt
  const anchor = from + (cursor < 0 ? insertText.length : cursor)
  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor, head: selectionEnd < 0 ? anchor : from + selectionEnd },
    userEvent: 'input.complete',
    scrollIntoView: true,
  })
  if (command.suggestAfter) startCompletion(view)
}

/**
 * Suggests Markdown to insert after "/" typed at the start of a line or after a space. A slash
 * inside a word, a web address, or a date (and/or, https://, 3/11) never opens the menu.
 */
export function slashCommandCompletions(context: CompletionContext): CompletionResult | null {
  const typed = context.matchBefore(/(?:^|\s)\/[\p{L}\p{N}-]*$/u)
  if (!typed) return null
  const slashAt = typed.from + typed.text.indexOf('/')
  // In a fenced code block the slash is code, not a command.
  const textBefore = context.state.sliceDoc(0, slashAt)
  if (((textBefore.match(/^\s{0,3}(```|~~~)/gm) ?? []).length) % 2 === 1) return null
  // Labels that start with what was typed come first, then labels or keywords containing it.
  const query = typed.text.slice(typed.text.indexOf('/') + 1).toLocaleLowerCase()
  const starts: SlashCommand[] = []
  const contains: SlashCommand[] = []
  for (const command of SLASH_COMMANDS) {
    const label = t(command.label).toLocaleLowerCase()
    if (label.startsWith(query) || label.split(' ').some((word) => word.startsWith(query))) starts.push(command)
    else if (label.includes(query) || command.keywords?.includes(query)) contains.push(command)
  }
  const options: Completion[] = [...starts, ...contains].map((command) => ({
    label: t(command.label),
    detail: command.detail,
    apply: (view, _completion, _from, to) => insert(view, command, slashAt, to),
  }))
  if (!options.length) return null
  return { from: slashAt + 1, options, filter: false }
}
